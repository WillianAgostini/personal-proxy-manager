import express from "express";
import path from "path";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

const DEFAULT_TARGET_HOST = process.env.DEFAULT_TARGET_HOST || "https://github.com";
const HOST_URL = process.env.HOST_URL || "http://localhost:3001";
const PORT = process.env.PORT || 3001;
const app = express();

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/admin", (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "admin.html"));
});

app.get("/current-target-host", (req, res) => {
    res.status(200).json({
        targetHost: getTargetHost(req),
        urlMapping: getUrlMapping(req),
    });
});

app.post("/current-target-host", (req, res) => {
    const { targetHost, urlMapping } = req.body;

    if (!targetHost || typeof targetHost !== "string") {
        return res.status(400).json({ message: "Invalid 'targetHost' parameter." });
    }

    if (!isValidUrlMapping(urlMapping)) {
        return res.status(400).json({ message: "Invalid 'urlMapping' parameter. It must be a JSON object." });
    }

    try {
        res.cookie("proxy_urlMapping", JSON.stringify(urlMapping), { httpOnly: false });
        res.cookie("proxy_host", targetHost, { httpOnly: false });
        return res.status(200).json({
            message: "TARGET_HOST and mappings successfully updated.",
            targetHost,
            urlMapping,
        });
    } catch (error) {
        return res.status(500).json({
            message: "An error occurred while updating the settings.",
            error: error.message,
        });
    }
});

app.use(async (req, res) => {
    const targetHost = getTargetHost(req);
    const urlMapping = getUrlMapping(req);
    const { hostname, pathname, search, protocol } = new URL(req.url, targetHost);

    const uuid = pathname.split('/').at(1);
    const mappedPath = urlMapping[uuid] || '';
    const host = (mappedPath || hostname).replace(/https?:\/\//, '');
    const path = pathname.replace(`/${uuid}`, '');

    try {
        const response = await fetch(`${protocol}//${host}${path}${search}`, {
            method: req.method,
            headers: { ...req.headers, Host: hostname },
        });

        if (!response.ok) {
            res.writeHead(response.status, response.headers);
            return res.end(`HTTP error! status: ${response.status}`);
        }

        res.writeHead(response.status, response.headers);

        for await (const chunk of response.body) {
            let replacedChunk = Buffer.from(chunk).toString();
            replacedChunk = replacedChunk.replaceAll(targetHost, HOST_URL);
            Object.entries(urlMapping).forEach(([key, value]) => {
                replacedChunk = replacedChunk.replaceAll(value, `${HOST_URL}/${key}`);
            });
            res.write(Buffer.from(replacedChunk));
        }
        res.end();
    } catch (error) {
        console.error("Proxy error:", error.message);
        if (!res.headersSent) {
            res.status(500).send("Internal proxy server error.");
        }
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running at ${HOST_URL}`);
    console.log(`Default target host: ${DEFAULT_TARGET_HOST}`);
    console.log(`Access the admin panel at ${HOST_URL}/admin`);
});

function getTargetHost(req) {
    return req?.cookies?.proxy_host || DEFAULT_TARGET_HOST;
}

function getUrlMapping(req) {
    try {
        const mappingCookie = req?.cookies?.proxy_urlMapping;
        return mappingCookie ? JSON.parse(mappingCookie) : {};
    } catch (error) {
        console.error("Failed to parse URL mapping from cookie:", error);
        return {};
    }
}

function isValidUrlMapping(urlMapping) {
    return urlMapping && typeof urlMapping === "object" && !Array.isArray(urlMapping);
}
