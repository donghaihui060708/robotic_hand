package com.donghaihui.robothand;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

@CapacitorPlugin(name = "MdnsResolver")
public class MdnsResolverPlugin extends Plugin {
    private static final String MDNS_GROUP = "224.0.0.251";
    private static final int MDNS_PORT = 5353;

    @PluginMethod
    public void resolve(PluginCall call) {
        String host = call.getString("host", "");
        int timeoutMs = call.getInt("timeoutMs", 1800);
        if (host == null || host.trim().isEmpty()) {
            call.reject("host is required");
            return;
        }

        new Thread(() -> {
            try {
                String address = resolveMdnsHost(host.trim(), Math.max(500, timeoutMs));
                if (address == null) {
                    call.reject("No mDNS A record found for " + host);
                    return;
                }
                JSObject result = new JSObject();
                result.put("host", host);
                result.put("address", address);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        }, "robot-hand-mdns-resolver").start();
    }

    private String resolveMdnsHost(String host, int timeoutMs) throws Exception {
        byte[] query = buildQuery(host);
        long deadline = System.currentTimeMillis() + timeoutMs;

        try (MulticastSocket socket = new MulticastSocket()) {
            socket.setReuseAddress(true);
            socket.setTimeToLive(255);
            socket.send(new DatagramPacket(query, query.length, InetAddress.getByName(MDNS_GROUP), MDNS_PORT));

            byte[] buffer = new byte[1500];
            while (System.currentTimeMillis() < deadline) {
                socket.setSoTimeout((int) Math.max(100, deadline - System.currentTimeMillis()));
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                socket.receive(packet);
                String address = parseAddress(packet.getData(), packet.getLength(), host);
                if (address != null) return address;
            }
        }
        return null;
    }

    private byte[] buildQuery(String host) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(new byte[] {
            0, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 0, 0
        });
        for (String label : host.split("\\.")) {
            byte[] bytes = label.getBytes(StandardCharsets.UTF_8);
            out.write(bytes.length);
            out.write(bytes);
        }
        out.write(0);
        out.write(new byte[] { 0, 1, 0, 1 }); // A, IN
        return out.toByteArray();
    }

    private String parseAddress(byte[] data, int length, String expectedHost) throws Exception {
        if (length < 12) return null;
        int qd = readU16(data, 4);
        int an = readU16(data, 6);
        int ns = readU16(data, 8);
        int ar = readU16(data, 10);
        int pos = 12;

        for (int i = 0; i < qd; i++) {
            NameResult question = readName(data, length, pos);
            pos = question.nextOffset + 4;
            if (pos > length) return null;
        }

        int records = an + ns + ar;
        String wanted = normalizeHost(expectedHost);
        for (int i = 0; i < records && pos < length; i++) {
            NameResult name = readName(data, length, pos);
            pos = name.nextOffset;
            if (pos + 10 > length) return null;
            int type = readU16(data, pos);
            int rrClass = readU16(data, pos + 2);
            int rdLength = readU16(data, pos + 8);
            pos += 10;
            if (pos + rdLength > length) return null;

            if (type == 1 && (rrClass & 0x7fff) == 1 && rdLength == 4
                    && normalizeHost(name.name).equals(wanted)) {
                return (data[pos] & 0xff) + "." + (data[pos + 1] & 0xff) + "."
                        + (data[pos + 2] & 0xff) + "." + (data[pos + 3] & 0xff);
            }
            pos += rdLength;
        }
        return null;
    }

    private NameResult readName(byte[] data, int length, int offset) throws Exception {
        StringBuilder name = new StringBuilder();
        int pos = offset;
        int next = -1;
        int guard = 0;

        while (pos < length && guard++ < 64) {
            int len = data[pos] & 0xff;
            if (len == 0) {
                pos++;
                break;
            }
            if ((len & 0xc0) == 0xc0) {
                if (pos + 1 >= length) throw new Exception("Invalid compressed mDNS name");
                int pointer = ((len & 0x3f) << 8) | (data[pos + 1] & 0xff);
                if (next < 0) next = pos + 2;
                pos = pointer;
                continue;
            }
            pos++;
            if (pos + len > length) throw new Exception("Invalid mDNS name");
            if (name.length() > 0) name.append('.');
            name.append(new String(data, pos, len, StandardCharsets.UTF_8));
            pos += len;
        }
        return new NameResult(name.toString(), next >= 0 ? next : pos);
    }

    private int readU16(byte[] data, int offset) {
        return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
    }

    private String normalizeHost(String host) {
        String normalized = host.toLowerCase(Locale.ROOT);
        return normalized.endsWith(".") ? normalized.substring(0, normalized.length() - 1) : normalized;
    }

    private static class NameResult {
        final String name;
        final int nextOffset;

        NameResult(String name, int nextOffset) {
            this.name = name;
            this.nextOffset = nextOffset;
        }
    }
}
