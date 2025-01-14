import express from "express";
import http from "http";
import https from "https";
import path from "path";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

const DEFAULT_TARGET_HOST = process.env.DEFAULT_TARGET_HOST || "https://github.com";
const PORT = process.env.PORT || 3000;
const app = express();

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/admin", (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "admin.html"));
});

app.get("/current-target-host", (req, res) => {
    const targetHost = getTargetHost(req);
    res.status(200).json({ targetHost });
});

app.post("/current-target-host", (req, res) => {
    const { targetHost } = req.body;
    if (targetHost && typeof targetHost === "string") {
        res.cookie("proxy_host", targetHost, { httpOnly: false });
        res.status(200).json({ message: "TARGET_HOST successfully updated.", targetHost });
    } else {
        res.status(400).json({ message: "Invalid 'targetHost' parameter." });
    }
});

app.use((req, res) => {
    const targetHost = getTargetHost(req);
    const { hostname, pathname, search, protocol } = new URL(req.url, targetHost);

    const options = {
        hostname: hostname,
        path: pathname + search,
        method: req.method,
        headers: {
            ...req.headers,
            Host: hostname,
        },
    };

    const proxy = (protocol === "https:" ? https : http).request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    req.pipe(proxy);

    proxy.on("error", (err) => {
        console.error("Proxy error:", err.message);
        res.status(500).send("Internal proxy server error.");
    });
});

app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    console.log(`Default target host: ${DEFAULT_TARGET_HOST}`);
    console.log(`Access the admin panel at http://localhost:${PORT}/admin`);
});

function getTargetHost(req) {
    return req?.cookies?.proxy_host || DEFAULT_TARGET_HOST;
}
