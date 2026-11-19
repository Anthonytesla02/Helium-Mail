package app.heliummail.client;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.mail.Address;
import javax.mail.AuthenticationFailedException;
import javax.mail.BodyPart;
import javax.mail.FetchProfile;
import javax.mail.Flags;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.UIDFolder;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;

@CapacitorPlugin(name = "NativeMail")
public class NativeMailPlugin extends Plugin {
    private static final ExecutorService IO_EXECUTOR = Executors.newCachedThreadPool();

    private static final class ExtractedBody {
        String text = "";
        String html = null;
        final List<JSObject> attachments = new ArrayList<>();
    }

    private Properties buildImapProperties(String host, int port, boolean secure) {
        Properties props = new Properties();
        String proto = secure ? "imaps" : "imap";
        props.put("mail.store.protocol", proto);
        props.put("mail." + proto + ".host", host);
        props.put("mail." + proto + ".port", String.valueOf(port));
        props.put("mail." + proto + ".connectiontimeout", "12000");
        props.put("mail." + proto + ".timeout", "18000");
        props.put("mail." + proto + ".writetimeout", "12000");
        props.put("mail." + proto + ".ssl.protocols", "TLSv1.2 TLSv1.3");
        if (secure) {
            props.put("mail.imaps.ssl.enable", "true");
        } else {
            props.put("mail.imap.starttls.enable", "true");
        }
        return props;
    }

    private Properties buildSmtpProperties(String host, int port, boolean secure) {
        Properties props = new Properties();
        boolean useSsl = secure || port == 465;
        String proto = useSsl ? "smtps" : "smtp";
        props.put("mail.transport.protocol", proto);
        props.put("mail." + proto + ".host", host);
        props.put("mail." + proto + ".port", String.valueOf(port));
        props.put("mail." + proto + ".auth", "true");
        props.put("mail." + proto + ".connectiontimeout", "12000");
        props.put("mail." + proto + ".timeout", "18000");
        props.put("mail." + proto + ".writetimeout", "12000");
        props.put("mail." + proto + ".ssl.protocols", "TLSv1.2 TLSv1.3");
        if (useSsl) {
            props.put("mail.smtps.ssl.enable", "true");
        } else {
            props.put("mail.smtp.starttls.enable", "true");
        }
        return props;
    }

    private String formatFriendlyError(Exception ex, String email, String host) {
        if (ex instanceof AuthenticationFailedException) {
            if (email != null && email.toLowerCase(Locale.ROOT).endsWith("@gmail.com")) {
                return "Gmail rejected the password (535 Authentication failed). Make sure 2-Step Verification is enabled and use a 16-character Google App Password instead of your regular Gmail password.";
            }
            return "Authentication failed on " + host + ". Double-check your email address and password/App Password.";
        }
        String msg = ex.getMessage();
        if (msg == null || msg.trim().isEmpty()) {
            return ex.getClass().getSimpleName() + " while connecting to " + host;
        }
        return msg;
    }

    private static String toIsoString(Date date) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(date != null ? date : new Date());
    }

    private static String stripHtml(String html) {
        if (html == null) return "";
        return html
            .replaceAll("(?is)<style[^>]*>.*?</style>", " ")
            .replaceAll("(?is)<script[^>]*>.*?</script>", " ")
            .replaceAll("<[^>]+>", " ")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static String createSnippet(String text) {
        if (text == null) return "";
        String cleaned = text.replaceAll("\\s+", " ").trim();
        if (cleaned.length() <= 140) return cleaned;
        return cleaned.substring(0, 137) + "...";
    }

    private static void extractPart(Part part, ExtractedBody out, String uidKey) {
        try {
            String disposition = part.getDisposition();
            String fileName = part.getFileName();
            boolean isAttachment = Part.ATTACHMENT.equalsIgnoreCase(disposition) ||
                (fileName != null && !fileName.trim().isEmpty() && !part.isMimeType("text/*"));

            if (isAttachment) {
                JSObject att = new JSObject();
                int idx = out.attachments.size();
                att.put("id", "att-" + uidKey + "-" + idx);
                att.put("filename", fileName != null ? MimeUtility.decodeText(fileName) : ("attachment-" + (idx + 1)));
                String contentType = part.getContentType();
                if (contentType != null && contentType.contains(";")) {
                    contentType = contentType.substring(0, contentType.indexOf(';')).trim();
                }
                att.put("mimeType", contentType != null ? contentType : "application/octet-stream");
                att.put("sizeBytes", Math.max(0, part.getSize()));
                out.attachments.add(att);
                return;
            }

            if (part.isMimeType("text/plain") && (out.text == null || out.text.isEmpty())) {
                Object content = part.getContent();
                if (content != null) {
                    out.text = String.valueOf(content);
                }
            } else if (part.isMimeType("text/html") && out.html == null) {
                Object content = part.getContent();
                if (content != null) {
                    out.html = String.valueOf(content);
                }
            } else if (part.isMimeType("multipart/*")) {
                Object content = part.getContent();
                if (content instanceof Multipart) {
                    Multipart mp = (Multipart) content;
                    for (int i = 0; i < mp.getCount(); i++) {
                        BodyPart bp = mp.getBodyPart(i);
                        extractPart(bp, out, uidKey);
                    }
                }
            }
        } catch (Exception ignored) {
            // Skip malformed MIME part without aborting entire inbox sync
        }
    }

    private static JSObject participantToJs(Address addr, String fallbackName) {
        JSObject obj = new JSObject();
        if (addr instanceof InternetAddress) {
            InternetAddress ia = (InternetAddress) addr;
            String email = ia.getAddress() != null ? ia.getAddress().trim() : "";
            String personal = ia.getPersonal();
            String name = (personal != null && !personal.trim().isEmpty())
                ? personal.trim()
                : (!email.isEmpty() ? email.split("@")[0] : fallbackName);
            obj.put("name", name);
            obj.put("email", email);
        } else {
            String raw = addr != null ? addr.toString() : "";
            obj.put("name", !raw.isEmpty() ? raw : fallbackName);
            obj.put("email", raw);
        }
        return obj;
    }

    @PluginMethod
    public void testConnection(PluginCall call) {
        String email = call.getString("email", "").trim();
        String password = call.getString("password", "");
        String imapHost = call.getString("imapHost", "").trim();
        int imapPort = call.getInt("imapPort", 993);
        boolean imapSecure = Boolean.TRUE.equals(call.getBoolean("imapSecure", true));
        String smtpHost = call.getString("smtpHost", "").trim();
        int smtpPort = call.getInt("smtpPort", 465);
        boolean smtpSecure = Boolean.TRUE.equals(call.getBoolean("smtpSecure", true));

        if (email.isEmpty() || password.isEmpty() || imapHost.isEmpty() || smtpHost.isEmpty()) {
            call.reject("Missing required IMAP/SMTP credentials.");
            return;
        }

        IO_EXECUTOR.execute(() -> {
            Store store = null;
            Transport transport = null;
            try {
                Properties imapProps = buildImapProperties(imapHost, imapPort, imapSecure);
                Session imapSession = Session.getInstance(imapProps);
                String imapProto = imapSecure ? "imaps" : "imap";
                store = imapSession.getStore(imapProto);
                store.connect(imapHost, imapPort, email, password);
                store.close();
                store = null;

                Properties smtpProps = buildSmtpProperties(smtpHost, smtpPort, smtpSecure);
                Session smtpSession = Session.getInstance(smtpProps, new javax.mail.Authenticator() {
                    @Override
                    protected PasswordAuthentication getPasswordAuthentication() {
                        return new PasswordAuthentication(email, password);
                    }
                });
                boolean useSmtps = smtpSecure || smtpPort == 465;
                transport = smtpSession.getTransport(useSmtps ? "smtps" : "smtp");
                transport.connect(smtpHost, smtpPort, email, password);
                transport.close();
                transport = null;

                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("message", "IMAP and SMTP connections verified directly from your device.");
                call.resolve(result);
            } catch (Exception ex) {
                call.reject(formatFriendlyError(ex, email, imapHost));
            } finally {
                if (store != null && store.isConnected()) {
                    try { store.close(); } catch (Exception ignored) {}
                }
                if (transport != null && transport.isConnected()) {
                    try { transport.close(); } catch (Exception ignored) {}
                }
            }
        });
    }

    @PluginMethod
    public void syncImap(PluginCall call) {
        String accountId = call.getString("accountId", "");
        String email = call.getString("email", "").trim();
        String displayName = call.getString("displayName", "");
        String password = call.getString("password", "");
        String imapHost = call.getString("imapHost", "").trim();
        int imapPort = call.getInt("imapPort", 993);
        boolean imapSecure = Boolean.TRUE.equals(call.getBoolean("imapSecure", true));
        int limit = Math.max(1, Math.min(40, call.getInt("limit", 20)));

        if (accountId.isEmpty() || email.isEmpty() || password.isEmpty() || imapHost.isEmpty()) {
            call.reject("IMAP credentials are incomplete for this account.");
            return;
        }

        IO_EXECUTOR.execute(() -> {
            Store store = null;
            Folder inbox = null;
            try {
                Properties props = buildImapProperties(imapHost, imapPort, imapSecure);
                Session session = Session.getInstance(props);
                String proto = imapSecure ? "imaps" : "imap";
                store = session.getStore(proto);
                store.connect(imapHost, imapPort, email, password);

                inbox = store.getFolder("INBOX");
                inbox.open(Folder.READ_ONLY);

                int total = inbox.getMessageCount();
                JSArray messagesArr = new JSArray();

                if (total > 0) {
                    int start = Math.max(1, total - limit + 1);
                    Message[] msgs = inbox.getMessages(start, total);

                    FetchProfile fp = new FetchProfile();
                    fp.add(FetchProfile.Item.ENVELOPE);
                    fp.add(FetchProfile.Item.FLAGS);
                    fp.add(UIDFolder.FetchProfileItem.UID);
                    inbox.fetch(msgs, fp);

                    UIDFolder uidFolder = (inbox instanceof UIDFolder) ? (UIDFolder) inbox : null;

                    for (int i = msgs.length - 1; i >= 0; i--) {
                        Message m = msgs[i];
                        long uid = uidFolder != null ? uidFolder.getUID(m) : (start + i);
                        String uidKey = accountId + "-" + uid;
                        String remoteId = "imap-" + uidKey;

                        JSObject item = new JSObject();
                        item.put("id", "msg-" + System.currentTimeMillis() + "-" + uid);
                        item.put("remoteId", remoteId);
                        item.put("accountId", accountId);

                        String[] inReplyToHeaders = m.getHeader("In-Reply-To");
                        String[] msgIdHeaders = m.getHeader("Message-ID");
                        String threadId = (inReplyToHeaders != null && inReplyToHeaders.length > 0 && inReplyToHeaders[0] != null)
                            ? inReplyToHeaders[0].trim()
                            : (msgIdHeaders != null && msgIdHeaders.length > 0 && msgIdHeaders[0] != null
                                ? msgIdHeaders[0].trim()
                                : ("thread-imap-" + uid));
                        item.put("threadId", threadId);

                        Address[] fromAddrs = m.getFrom();
                        if (fromAddrs != null && fromAddrs.length > 0) {
                            item.put("from", participantToJs(fromAddrs[0], "Sender"));
                        } else {
                            JSObject fallbackFrom = new JSObject();
                            fallbackFrom.put("name", "Sender");
                            fallbackFrom.put("email", "");
                            item.put("from", fallbackFrom);
                        }

                        JSArray toArr = new JSArray();
                        Address[] recips = m.getRecipients(Message.RecipientType.TO);
                        if (recips != null && recips.length > 0) {
                            for (Address r : recips) {
                                toArr.put(participantToJs(r, displayName));
                            }
                        } else {
                            JSObject selfTo = new JSObject();
                            selfTo.put("name", displayName != null && !displayName.isEmpty() ? displayName : email);
                            selfTo.put("email", email);
                            toArr.put(selfTo);
                        }
                        item.put("to", toArr);

                        String subject = m.getSubject();
                        item.put("subject", (subject != null && !subject.trim().isEmpty()) ? subject : "(No subject)");

                        ExtractedBody extracted = new ExtractedBody();
                        extractPart(m, extracted, String.valueOf(uid));

                        String bodyText = (extracted.text != null && !extracted.text.trim().isEmpty())
                            ? extracted.text
                            : stripHtml(extracted.html);
                        item.put("bodyText", bodyText);
                        if (extracted.html != null) {
                            item.put("bodyHtml", extracted.html);
                        }
                        item.put("snippet", createSnippet(bodyText));

                        Date received = m.getReceivedDate() != null ? m.getReceivedDate() : m.getSentDate();
                        item.put("timestamp", toIsoString(received));
                        item.put("folder", "inbox");
                        item.put("isRead", m.isSet(Flags.Flag.SEEN));
                        item.put("isStarred", m.isSet(Flags.Flag.FLAGGED));
                        item.put("labels", new JSArray());

                        JSArray attArr = new JSArray();
                        for (JSObject att : extracted.attachments) {
                            attArr.put(att);
                        }
                        item.put("attachments", attArr);

                        messagesArr.put(item);
                    }
                }

                JSObject result = new JSObject();
                result.put("messages", messagesArr);
                call.resolve(result);
            } catch (Exception ex) {
                call.reject(formatFriendlyError(ex, email, imapHost));
            } finally {
                if (inbox != null && inbox.isOpen()) {
                    try { inbox.close(false); } catch (Exception ignored) {}
                }
                if (store != null && store.isConnected()) {
                    try { store.close(); } catch (Exception ignored) {}
                }
            }
        });
    }

    @PluginMethod
    public void sendSmtp(PluginCall call) {
        String email = call.getString("email", "").trim();
        String displayName = call.getString("displayName", "");
        String password = call.getString("password", "");
        String smtpHost = call.getString("smtpHost", "").trim();
        int smtpPort = call.getInt("smtpPort", 465);
        boolean smtpSecure = Boolean.TRUE.equals(call.getBoolean("smtpSecure", true));
        String to = call.getString("to", "").trim();
        String cc = call.getString("cc", "").trim();
        String bcc = call.getString("bcc", "").trim();
        String subject = call.getString("subject", "");
        String bodyText = call.getString("bodyText", "");

        if (email.isEmpty() || password.isEmpty() || smtpHost.isEmpty() || to.isEmpty()) {
            call.reject("Missing required SMTP fields to send message.");
            return;
        }

        IO_EXECUTOR.execute(() -> {
            Transport transport = null;
            try {
                Properties props = buildSmtpProperties(smtpHost, smtpPort, smtpSecure);
                Session session = Session.getInstance(props, new javax.mail.Authenticator() {
                    @Override
                    protected PasswordAuthentication getPasswordAuthentication() {
                        return new PasswordAuthentication(email, password);
                    }
                });

                MimeMessage msg = new MimeMessage(session);
                if (displayName != null && !displayName.trim().isEmpty()) {
                    msg.setFrom(new InternetAddress(email, displayName.trim(), "UTF-8"));
                } else {
                    msg.setFrom(new InternetAddress(email));
                }
                msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to));
                if (!cc.isEmpty()) {
                    msg.setRecipients(Message.RecipientType.CC, InternetAddress.parse(cc));
                }
                if (!bcc.isEmpty()) {
                    msg.setRecipients(Message.RecipientType.BCC, InternetAddress.parse(bcc));
                }
                msg.setSubject(subject != null ? subject : "", "UTF-8");
                msg.setText(bodyText != null ? bodyText : "", "UTF-8");
                msg.setSentDate(new Date());

                boolean useSmtps = smtpSecure || smtpPort == 465;
                transport = session.getTransport(useSmtps ? "smtps" : "smtp");
                transport.connect(smtpHost, smtpPort, email, password);
                transport.sendMessage(msg, msg.getAllRecipients());
                transport.close();
                transport = null;

                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception ex) {
                call.reject(formatFriendlyError(ex, email, smtpHost));
            } finally {
                if (transport != null && transport.isConnected()) {
                    try { transport.close(); } catch (Exception ignored) {}
                }
            }
        });
    }
}
