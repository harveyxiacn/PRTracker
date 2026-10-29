package io.github.harveyxiacn.prtracker;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * In-app updates for the APK published on GitHub Releases. Downloads only from this project's
 * release URLs, checks the SHA-256 published by GitHub, refuses an APK that is not signed with
 * the same certificate as the installed app (Android would refuse it too, but with a vague
 * error), then hands it to the system installer. The user always confirms the install.
 * Rejection codes: url, network, checksum, signature, test-build, not-newer, permission.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String ALLOWED_PREFIX = "https://github.com/harveyxiacn/PRTracker/releases/download/";
    private static final String DIR = "updates";
    private static final int TIMEOUT_MS = 30_000;

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        final String sha256 = call.getString("sha256");
        final String fileName = call.getString("fileName", "update.apk");
        if (url == null || !url.startsWith(ALLOWED_PREFIX)) {
            call.reject("Unexpected download address", "url");
            return;
        }
        if (fileName == null || !fileName.matches("[A-Za-z0-9._-]{1,80}\\.apk")) {
            call.reject("Unexpected file name", "url");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                File out = null;
                try {
                    File dir = new File(getContext().getCacheDir(), DIR);
                    clear(dir);
                    if (!dir.mkdirs() && !dir.isDirectory()) throw new Exception("Cannot create " + dir);
                    out = new File(dir, fileName);
                    String digest = fetch(url, out);
                    if (sha256 != null && !sha256.isEmpty() && !sha256.equalsIgnoreCase(digest)) {
                        out.delete();
                        call.reject("Checksum mismatch", "checksum");
                        return;
                    }
                    String problem = checkArchive(out);
                    if (problem != null) {
                        out.delete();
                        call.reject(problem, problem);
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("path", out.getAbsolutePath());
                    call.resolve(result);
                } catch (Exception e) {
                    if (out != null) out.delete();
                    call.reject("Download failed: " + e.getMessage(), "network");
                }
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context context = getContext();
        String path = call.getString("path");
        File dir = new File(context.getCacheDir(), DIR);
        File apk = path == null ? null : new File(path);
        if (apk == null || !apk.isFile() || !dir.equals(apk.getParentFile())) {
            call.reject("Nothing downloaded", "network");
            return;
        }
        // Android 8+: the user allows "install unknown apps" for this app once, in system settings.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settings);
            JSObject result = new JSObject();
            result.put("status", "needs-permission");
            call.resolve(result);
            return;
        }
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        JSObject result = new JSObject();
        result.put("status", "started");
        call.resolve(result);
    }

    /** Streams url to file, reporting progress, and returns the SHA-256 (lower-case hex). */
    private String fetch(String url, File out) throws Exception {
        // HttpURLConnection follows the https → https redirect to GitHub's asset storage.
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Accept", "application/octet-stream");
        try {
            int code = conn.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            if (!"https".equals(conn.getURL().getProtocol())) throw new Exception("Insecure redirect");
            long total = conn.getContentLengthLong();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[64 * 1024];
            long received = 0;
            int lastPct = -1;
            try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    md.update(buf, 0, n);
                    received += n;
                    int pct = total > 0 ? (int) (received * 100 / total) : -1;
                    if (pct != lastPct) {
                        lastPct = pct;
                        JSObject p = new JSObject();
                        p.put("received", received);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                }
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
            return hex.toString();
        } finally {
            conn.disconnect();
        }
    }

    /** null when the APK is a newer build of this app signed like the installed one; else a code. */
    private String checkArchive(File apk) throws Exception {
        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        PackageInfo installed = pm.getPackageInfo(context.getPackageName(), flags);
        if (archive == null || !context.getPackageName().equals(archive.packageName)) return "signature";
        if (versionCode(archive) <= versionCode(installed)) return "not-newer";
        Set<String> mine = signers(installed);
        Set<String> theirs = signers(archive);
        if (theirs.isEmpty() && flags != PackageManager.GET_SIGNATURES) {
            // Some Android 9–12 builds leave signingInfo empty for archives: ask the older way.
            @SuppressWarnings("deprecation")
            PackageInfo legacy = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNATURES);
            @SuppressWarnings("deprecation")
            PackageInfo legacyInstalled = pm.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNATURES);
            if (legacy != null) theirs = signers(legacy);
            mine.addAll(signers(legacyInstalled));
        }
        theirs.retainAll(mine);
        if (theirs.isEmpty()) {
            // A debug/test build has a different key: it can never update in place.
            boolean debuggable = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            return debuggable ? "test-build" : "signature";
        }
        return null;
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    /** SHA-256 digests of the signing certificates (including rotated ones). */
    @SuppressWarnings("deprecation")
    private static Set<String> signers(PackageInfo info) throws Exception {
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            SigningInfo si = info.signingInfo;
            sigs = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
        }
        if (sigs == null) sigs = info.signatures;
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest(s.toByteArray())) hex.append(String.format(Locale.ROOT, "%02x", b));
            out.add(hex.toString());
        }
        return out;
    }

    private static void clear(File dir) {
        File[] old = dir.listFiles();
        if (old == null) return;
        for (File f : old) f.delete();
    }
}
