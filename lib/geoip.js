/**
 * BMW LITE - IP Geolocation (kwa ajili ya "Login Activity/Security" -
 * akaunti kuona historia ya login zake YENYEWE, sio kufuatilia wageni).
 * Inatumia ip-api.com (free, hauhitaji API key) - "best effort" tu, ikishindwa
 * login inaendelea kawaida bila city/country.
 */
const axios = require("axios");

async function lookupIp(ip) {
    if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) {
        return { city: "Local/Private", country: "" };
    }
    try {
        const res = await axios.get(`http://ip-api.com/json/${ip}`, {
            params: { fields: "status,city,country" },
            timeout: 4000,
        });
        if (res.data?.status === "success") {
            return { city: res.data.city || "", country: res.data.country || "" };
        }
        return { city: "", country: "" };
    } catch (_) {
        return { city: "", country: "" };
    }
}

module.exports = { lookupIp };
