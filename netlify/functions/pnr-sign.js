// netlify/functions/pnr-sign.js
const { ethers } = require("ethers");

const CHAIN_ID = 137;
const PNR_CONTRACT = "0xcB819189dD53FA65b5b15E979b5D6715752Acef9";

// IMPORTANT: Set this in Netlify Environment Variables (never in code)
const OPERATOR_PK = process.env.OPERATOR_PK;

function utcDayIdNow(tsSec) {
  return Math.floor(tsSec / 86400);
}

function ymdUTC(tsSec) {
  const d = new Date(tsSec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Optional: simple allowlist CORS (set your site URL in Netlify env ORIGIN_ALLOW)
// Example ORIGIN_ALLOW = https://dreamplay-rhythm-board.netlify.app
function corsHeaders(origin) {
  const allowed = process.env.ORIGIN_ALLOW;
  if (allowed && origin && origin === allowed) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };
  }
  // If you don’t set ORIGIN_ALLOW, allow same-origin usage (Netlify site)
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || "";

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
    };
  }

  try {
    if (!OPERATOR_PK) {
      return {
        statusCode: 500,
        headers: corsHeaders(origin),
        body: JSON.stringify({ error: "MISSING_OPERATOR_PK" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const user = String(body.user || "");
    const expiresInSec = Number(body.expiresInSec || 900);

    if (!ethers.utils.isAddress(user)) {
      return {
        statusCode: 400,
        headers: corsHeaders(origin),
        body: JSON.stringify({ error: "BAD_USER" }),
      };
    }

    const now = Math.floor(Date.now() / 1000);

    // If dayId not provided, compute server-side (recommended)
    const dayId = Number.isFinite(Number(body.dayId)) ? Number(body.dayId) : utcDayIdNow(now);

    // Deterministic default videoId: "PNR:YYYY-MM-DD"
    const videoIdStr = (body.videoId && String(body.videoId)) || `PNR:${ymdUTC(now)}`;
    const videoIdBytes32 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(videoIdStr));

    // Clamp expiry: 60s..3600s
    const exp = Math.max(60, Math.min(expiresInSec, 3600));
    const expiresAt = now + exp;

    // Digest must match your contract exactly:
    // keccak256(abi.encodePacked("DreamPlayPNR:", chainid, contract, user, dayId, videoId, expiresAt))
    const digest = ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ["string", "uint256", "address", "address", "uint32", "bytes32", "uint64"],
        ["DreamPlayPNR:", CHAIN_ID, PNR_CONTRACT, user, dayId, videoIdBytes32, expiresAt]
      )
    );

    const operator = new ethers.Wallet(OPERATOR_PK);
    const sig = await operator.signMessage(ethers.utils.arrayify(digest));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      body: JSON.stringify({
        dayId,
        videoIdStr,
        videoIdBytes32,
        expiresAt,
        digest,
        sig,
        signer: operator.address,
        contract: PNR_CONTRACT,
        chainId: CHAIN_ID,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: "SIGN_FAIL", message: e.message }),
    };
  }
};
