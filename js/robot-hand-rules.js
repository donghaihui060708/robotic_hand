(function () {
    const FALLBACK_SYSTEM_PROMPT = `You are the control brain of an embodied robotic hand.
Output ONLY valid JSON. No markdown.

Critical priority:
1. Math questions and simple word problems are NOT gesture commands. Output {"mode":"show_result","result":"<answer>","reply":"<short answer>"} and do NOT include "ans".
2. Any wording or word order that refers to the Rock-Paper-Scissors game (for example 石头剪刀布, 剪刀石头布, 石头剪子布, 猜拳, 划拳, rock paper scissors) is a game request. Output {"mode":"rps","reply":"<short reply>"}; the browser will choose the throw.
3. Photo/camera/cheese/pose-for-camera always returns one single victory gesture: {"ans":"2"}. Never use a sequence for photo requests.
4. Only direct hand/gesture commands should use {"ans":"0"..."9"}.
5. Reply language lock: the user's language is {{LANGUAGE_NAME}}. The "reply" field MUST be {{REPLY_LANGUAGE_RULE}}.
6. Use custom_sequence only when the user explicitly asks for order, repeated motion, training, rehabilitation, performance, or a routine.
7. For everyday statements, feelings, news, unclear text, or negative constraints, output {"mode":"intent","intent":"<intent>","reply":"<short reply>"}.
8. If the user is not asking math, not asking to play rock-paper-scissors, and not directly asking for a hand pose, never output "show_result", "rps", or "ans".

Intent categories: celebration, gratitude, greeting, goodbye, comfort, agreement, neutral.

Gesture codes:
0 = Fist / rock in RPS
1 = Index finger / number one / point
2 = Victory / scissors in RPS / photo pose / cheese / 茄子 / 拍照
3 = OK-3 / number three
4 = Four
5 = Open palm / paper in RPS / wave / hello / goodbye / comfort
6 = Call-me / phone
7 = Rock music sign
8 = Precision OK / OK / fine
9 = Thumbs up / like / happy / thanks / praise / congratulations`;

    let cachedPrompt = null;

    const INTENT_TO_GESTURE = {
        celebration: "9",
        gratitude: "9",
        praise: "9",
        greeting: "5",
        goodbye: "5",
        comfort: "5",
        agreement: "8",
        photo: "2",
        neutral: null
    };

    function hasChineseText(text) {
        return /[\u4e00-\u9fff]/.test(String(text || ''));
    }

    function detectUserLanguage(text) {
        return hasChineseText(text) ? 'zh-CN' : 'en-US';
    }

    function parseSmallNumberToken(token) {
        const clean = String(token || '').trim().toLowerCase().replace(/[，。,.?？!！]/g, '');
        if (/^-?\d+(\.\d+)?$/.test(clean)) return Number(clean);

        const zh = { '零':0, '一':1, '二':2, '两':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9 };
        const en = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
        if (Object.prototype.hasOwnProperty.call(zh, clean)) return zh[clean];
        if (Object.prototype.hasOwnProperty.call(en, clean)) return en[clean];
        if (clean === '十') return 10;
        if (clean.includes('十')) {
            const parts = clean.split('十');
            const tens = parts[0] ? zh[parts[0]] : 1;
            const ones = parts[1] ? zh[parts[1]] : 0;
            if (typeof tens === 'number' && typeof ones === 'number') return tens * 10 + ones;
        }
        return null;
    }

    function extractQuantityNumbers(text) {
        const result = [];
        const raw = String(text || '');
        const compact = raw.replace(/\s+/g, '');
        const zhQuantityPattern = /(\d+|[零一二两三四五六七八九十]{1,3})(?=个|只|颗|本|支|根|块|片|张|朵|辆|苹果|橘子|梨|香蕉|糖|球|书|笔|人)/g;
        let match;
        while ((match = zhQuantityPattern.exec(compact)) !== null) {
            const value = parseSmallNumberToken(match[1]);
            if (value !== null) result.push(value);
        }

        const enQuantityPattern = /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?=apple|apples|orange|oranges|banana|bananas|book|books|pen|pens|candy|candies|ball|balls|person|people|item|items)\b/gi;
        while ((match = enQuantityPattern.exec(raw)) !== null) {
            const value = parseSmallNumberToken(match[1]);
            if (value !== null) result.push(value);
        }
        return result;
    }

    function isLikelyMathQuestion(text) {
        const raw = String(text || '').toLowerCase();
        const compact = raw.replace(/\s+/g, '');
        const hasNumber = /[\d零一二两三四五六七八九十]/.test(compact) || /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(raw);
        const hasCue = /(几个|多少|一共|总共|现在.*有|还剩|剩下|等于几|是多少|加|减|\+|-|乘|除|howmany|howmuch|whatis|calculate|compute|left|altogether|total|have|has|apples?|oranges?|books?)/i.test(compact);
        return hasNumber && hasCue;
    }

    function tryEvaluateMathQuestion(text) {
        const raw = String(text || '').trim();
        const compact = raw.replace(/\s+/g, '').replace(/[？?。！!，,]/g, '');
        if (!compact) return null;

        let expression = compact.toLowerCase()
            .replace(/等于几|是多少|等于|多少|几个|几|what's|whatis|calculate|compute|solve/g, '')
            .replaceAll('加', '+').replaceAll('plus', '+')
            .replaceAll('减', '-').replaceAll('minus', '-')
            .replaceAll('乘以', '*').replaceAll('乘', '*').replaceAll('times', '*').replaceAll('×', '*')
            .replaceAll('除以', '/').replaceAll('除', '/').replaceAll('dividedby', '/').replaceAll('÷', '/');

        expression = expression.replace(/(零|一|二|两|三|四|五|六|七|八|九|十|[一二三四五六七八九]?十[一二三四五六七八九]?|zero|one|two|three|four|five|six|seven|eight|nine|ten)/gi, (m) => {
            const n = parseSmallNumberToken(m);
            return n === null ? m : String(n);
        });

        if (/[+\-*/]/.test(expression) && /^[0-9+\-*/().\s]+$/.test(expression)) {
            try {
                const result = Function('"use strict"; return (' + expression + ')')();
                if (Number.isFinite(result)) return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(4)));
            } catch {}
        }

        const looksLikeWordProblem = /(几个|多少|一共|总共|现在.*有|还剩|剩下|howmany|howmuch|left|altogether|total|have|has)/i.test(compact);
        if (!looksLikeWordProblem) return null;

        const numbers = extractQuantityNumbers(raw);
        if (numbers.length < 2) return null;

        const isSubtraction = /(吃了|拿走|送走|用掉|丢了|失去|少了|减去|还剩|剩下|left|lost|gaveaway|eat|eats|ate|used|uses)/i.test(compact);
        if (isSubtraction) return String(numbers.slice(1).reduce((acc, value) => acc - value, numbers[0]));

        const isAddition = /(又|再|给了|得到|买了|来了|加上|增加|一共|总共|altogether|total|more|gets|got|give|gives|gave|buy|buys|bought)/i.test(compact);
        if (isAddition) return String(numbers.reduce((acc, value) => acc + value, 0));
        return null;
    }

    function extractMathResultFromReply(reply) {
        const text = String(reply || '').trim();
        const patterns = [
            /(?:答案是|等于|一共是|总共是|还剩|剩下)\s*(\d+|[零一二两三四五六七八九十]{1,3})/,
            /(?:answer is|equals|you have|there are|left|altogether|total)\D*(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)/i,
            /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:apples?|oranges?|books?|items?)\s+(?:left|total|altogether)?\b/i
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const value = parseSmallNumberToken(match[1]);
                if (value !== null) return String(value);
            }
        }
        return null;
    }

    function fallbackReplyForLanguage(parsed, lang) {
        if (parsed && parsed.mode === 'show_result') return lang === 'zh-CN' ? `答案是${parsed.result}。` : `The answer is ${parsed.result}.`;
        const ans = parsed && parsed.hasOwnProperty('ans') ? String(parsed.ans).trim() : '';
        const zh = { "0":"握拳。", "1":"比一个一。", "2":"比耶。", "3":"比三个手指。", "4":"比四个手指。", "5":"张开手掌。", "6":"打电话手势。", "7":"摇滚手势。", "8":"确认手势。", "9":"点赞。" };
        const en = { "0":"Fist.", "1":"Pointing with one finger.", "2":"Peace sign.", "3":"Three fingers.", "4":"Four fingers.", "5":"Open palm.", "6":"Call me.", "7":"Rock sign.", "8":"OK gesture.", "9":"Thumbs up." };
        if (ans) return lang === 'zh-CN' ? (zh[ans] || '好的。') : (en[ans] || 'Okay.');
        return lang === 'zh-CN' ? '好的。' : 'Okay.';
    }

    function enforceReplyLanguage(reply, lang, parsed) {
        const clean = String(reply || '').trim();
        if (!clean) return fallbackReplyForLanguage(parsed, lang);
        if (lang === 'en-US' && hasChineseText(clean)) return fallbackReplyForLanguage(parsed, lang);
        if (lang === 'zh-CN' && (!hasChineseText(clean) || /[A-Za-z]/.test(clean))) return fallbackReplyForLanguage(parsed, lang);
        return clean;
    }

    function extractFirstJSON(text) {
        text = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        let depth = 0, start = -1;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (text[i] === '}') {
                depth--;
                if (depth === 0 && start !== -1) return text.substring(start, i + 1);
            }
        }
        return null;
    }

    function detectRPSIntent(text) {
        if (isLikelyMathQuestion(text)) return false;
        if (detectAchievementIntent(text)) return false;
        const raw = String(text || '').toLowerCase();
        const compact = raw.replace(/[\s，。！？、,.!?;；:：'"“”‘’·_-]+/g, '');

        // Named game expressions are enough on their own. Keep this separate from
        // individual gesture commands such as “出石头” or “比剪刀手”.
        if (/(猜拳|划拳|猜丁壳|猜丁硞|锤子剪刀布|playrps|\brps\b)/i.test(raw) || /playrps/i.test(compact)) return true;

        // Chinese speakers use both 剪刀/剪子 and often change the conventional
        // word order. Treat the presence of all three throws as the game rather
        // than enumerating every possible phrase.
        const hasZhRock = /(石头|锤子)/.test(compact);
        const hasZhScissors = /(剪刀|剪子)/.test(compact);
        const hasZhPaper = /布/.test(compact);
        if (hasZhRock && hasZhScissors && hasZhPaper) return true;

        // With an explicit game/start cue, two throw names are sufficient for
        // natural shortened requests such as “来一局石头剪刀”.
        const hasZhGameCue = /(玩|来一局|来一把|开始|开一局|比一局|游戏)/.test(compact);
        const zhThrowCount = Number(hasZhRock) + Number(hasZhScissors) + Number(hasZhPaper);
        if (hasZhGameCue && zhThrowCount >= 2) return true;

        const hasRock = /\b(rock|stone)\b/i.test(raw);
        const hasPaper = /\bpaper\b/i.test(raw);
        const hasScissors = /\bscissors?\b/i.test(raw);
        if (hasRock && hasPaper && hasScissors) return true;
        if (/\b(play|game|throw|choose|let'?s)\b/i.test(raw) && hasScissors && (hasRock || hasPaper)) return true;
        return false;
    }

    function detectAchievementIntent(text) {
        const raw = String(text || '').toLowerCase();
        const compact = raw.replace(/\s+/g, '');
        return /(考了?第?[一1](名)?|考试第?[一1](名)?|考第?[一1](名)?|拿了?第?[一1](名)?|得了?第?[一1](名)?|第?[一1]名|拿了?冠军|冠军|满分|考得好|获奖|拿奖|firstplace|first place|gotfirst|got first|won|winner|passed.*exam|exam.*passed)/i.test(compact) ||
               /\b(first place|got first|passed my exam|won the prize|won an award)\b/i.test(raw);
    }

    function detectDirectGestureIntent(text, lang) {
        const raw = String(text || '').toLowerCase();
        const compact = raw.replace(/\s+/g, '');
        if (/(不许|不要|别|不准|禁止|不能|别再|dont|don't|do not|never)/i.test(compact)) return null;

        const rules = [
            { ans: "2", zh: "来，茄子！", en: "Cheese! Showing victory.", pattern: /(茄子|拍照|照相|合照|自拍|拍个照|拍张照|cheese|photo|picture|takeaphoto|takepicture|selfie)/i },
            { ans: "9", zh: "好的，给你点赞。", en: "Sure, showing thumbs up.", pattern: /(点赞|赞一个|比个赞|thumbsup|thumbs-up|showthumbs?up|likegesture)/i },
            { ans: "6", zh: "好的，做打电话手势。", en: "Sure, showing the call-me gesture.", pattern: /(打电话|电话|callme|call-me|phone|telephone)/i },
            { ans: "8", zh: "好的，做 OK 手势。", en: "Sure, showing OK.", pattern: /(ok手势|比个?ok|做个?ok|okgesture|makeok|showok)/i },
            { ans: "7", zh: "摇滚手势。", en: "Rock on!", pattern: /(摇滚|rocksign|rockon|rockandroll)/i },
            { ans: "0", zh: "我出石头。", en: "I choose rock.", pattern: /(出石头|石头手势|showrock|chooserock|playrock)/i },
            { ans: "0", zh: "好的，握拳。", en: "Sure, making a fist.", pattern: /(握拳|拳头|fist|makeafist)/i },
            { ans: "1", zh: "好的，比数字一。", en: "Sure, showing number one.", pattern: /(数字一|比个一|比1|伸食指|指一下|point|indexfinger|numberone|showone)/i },
            { ans: "2", zh: "我出剪刀。", en: "I choose scissors.", pattern: /(出剪刀|showscissors|choosescissors|playscissors)/i },
            { ans: "2", zh: "好的，比耶。", en: "Sure, showing victory.", pattern: /(比个?耶|耶一下|剪刀手|胜利|victory|peace|scissors|vsign|v-sign)/i },
            { ans: "3", zh: "好的，比数字三。", en: "Sure, showing number three.", pattern: /(数字三|比个三|比3|showthree|numberthree)/i },
            { ans: "4", zh: "好的，比数字四。", en: "Sure, showing number four.", pattern: /(数字四|比个四|比4|showfour|numberfour)/i },
            { ans: "5", zh: "我出布。", en: "I choose paper.", pattern: /(出布|showpaper|choosepaper|playpaper)/i },
            { ans: "5", zh: "好的，张开手掌。", en: "Sure, opening the hand.", pattern: /(张开|打开手|打开手掌|摊开|放松|openhand|openpalm|paper|wave)/i },
        ];

        for (const rule of rules) {
            if (rule.pattern.test(raw) || rule.pattern.test(compact)) return { ans: rule.ans, reply: lang === 'zh-CN' ? rule.zh : rule.en };
        }
        return null;
    }

    function detectLocalGestureIntent(text, lang) {
        if (detectRPSIntent(text)) return null;
        const semanticIntent = detectSemanticIntent(text);
        if (semanticIntent) {
            return {
                ans: INTENT_TO_GESTURE[semanticIntent],
                reply: replyForIntent(semanticIntent, lang)
            };
        }
        return detectDirectGestureIntent(text, lang);
    }

    function detectSemanticIntent(text) {
        const raw = String(text || '').toLowerCase();
        const compact = raw.replace(/\s+/g, '');
        if (detectAchievementIntent(text)) return 'celebration';
        if (/(开心|高兴|快乐|兴奋|成功|恭喜|太好了|爽|发财|发工资|工资到账|涨工资|奖金|中奖|中了奖|放假|升职|录取|通过了|过了|拿到offer|goodnews|good news|payday|salary|bonus|promotion|promoted|vacation|holiday|accepted|offer|won|winner|success|happy|excited)/i.test(compact) || /\b(got paid|pay day|got my salary|got a bonus|good news)\b/i.test(raw)) {
            return 'celebration';
        }
        if (/(谢谢|感谢|多谢|thank|thanks|appreciate)/i.test(compact)) return 'gratitude';
        if (/(你好|嗨|哈喽|早上好|晚上好|\bhello\b|\bhi\b|\bhey\b)/i.test(raw)) return 'greeting';
        if (/(再见|拜拜|回头见|bye|goodbye|seeyou|see you)/i.test(raw) || /seeyou/i.test(compact)) return 'goodbye';
        if (/(累|难过|伤心|压力|不开心|沮丧|疲惫|烦|安慰|抱抱|急|着急|焦虑|慌|紧张|tired|sad|stressed|upset|exhausted|comfort|anxious|urgent|panic|nervous)/i.test(compact)) return 'comfort';
        if (/(ok|okay|sure|yes|yeah|yep|agree|confirm|approve|没问题|可以|好的|好呀|行|确认|同意|fine|不许|不要|别出|别做|不会|不能)/i.test(compact)) return 'agreement';
        return null;
    }

    function replyForIntent(intent, lang) {
        const zh = {
            celebration: '太好了，给你点个赞！',
            gratitude: '不客气，给你点赞！',
            praise: '太棒了，点赞！',
            greeting: '你好，很高兴见到你。',
            goodbye: '再见，回头见。',
            comfort: '辛苦了，放松一下。',
            agreement: '确认，可以。',
            photo: '来，比耶！',
            neutral: '好的。'
        };
        const en = {
            celebration: 'That is great news. Thumbs up!',
            gratitude: "You're welcome. Thumbs up!",
            praise: 'Great job. Thumbs up!',
            greeting: 'Hello, nice to meet you.',
            goodbye: 'Goodbye, see you later.',
            comfort: 'Take it easy. Opening the hand.',
            agreement: 'Sure, OK.',
            photo: 'Cheese! Showing victory.',
            neutral: 'Okay.'
        };
        return lang === 'zh-CN' ? (zh[intent] || zh.neutral) : (en[intent] || en.neutral);
    }

    function gestureForIntent(intent) {
        return INTENT_TO_GESTURE[String(intent || '').trim()] || null;
    }

    function applyPromptLanguage(prompt, lang) {
        return prompt
            .replaceAll('{{LANGUAGE_NAME}}', lang === 'zh-CN' ? 'Chinese' : 'English')
            .replaceAll('{{REPLY_LANGUAGE_RULE}}', lang === 'zh-CN' ? 'Chinese only' : 'English only');
    }

    async function loadSystemPrompt(lang) {
        if (cachedPrompt === null) {
            try {
                const response = await fetch('prompts/robot-hand-system-prompt.md', { cache: 'no-store' });
                if (!response.ok) throw new Error('Prompt fetch failed');
                cachedPrompt = await response.text();
            } catch (err) {
                console.warn('[RobotHandRules] Using fallback prompt:', err.message);
                cachedPrompt = FALLBACK_SYSTEM_PROMPT;
            }
        }
        return applyPromptLanguage(cachedPrompt, lang);
    }

    window.RobotHandRules = {
        hasChineseText,
        detectUserLanguage,
        parseSmallNumberToken,
        extractQuantityNumbers,
        isLikelyMathQuestion,
        tryEvaluateMathQuestion,
        extractMathResultFromReply,
        fallbackReplyForLanguage,
        enforceReplyLanguage,
        extractFirstJSON,
        detectRPSIntent,
        detectAchievementIntent,
        detectSemanticIntent,
        detectDirectGestureIntent,
        detectLocalGestureIntent,
        gestureForIntent,
        replyForIntent,
        loadSystemPrompt
    };
})();
