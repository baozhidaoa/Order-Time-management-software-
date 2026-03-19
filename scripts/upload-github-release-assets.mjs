import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const options = {
    exts: [],
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo") {
      options.repo = argv[++index];
      continue;
    }
    if (arg === "--tag") {
      options.tag = argv[++index];
      continue;
    }
    if (arg === "--dir") {
      options.dir = argv[++index];
      continue;
    }
    if (arg === "--ext") {
      options.exts.push(argv[++index]);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.repo || !options.tag || !options.dir || options.exts.length === 0) {
    throw new Error(
      "Usage: node scripts/upload-github-release-assets.mjs --repo <owner/repo> --tag <tag> --dir <dir> --ext <.ext> [--ext <.ext> ...]",
    );
  }

  return options;
}

function getUploadContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".apk") {
    return "application/vnd.android.package-archive";
  }
  if (extension === ".ipa") {
    return "application/octet-stream";
  }
  if (extension === ".zip") {
    return "application/zip";
  }
  if (extension === ".dmg") {
    return "application/octet-stream";
  }
  if (extension === ".exe") {
    return "application/vnd.microsoft.portable-executable";
  }
  return "application/octet-stream";
}

async function githubRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "order-codemagic-release-upload",
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function uploadAsset(uploadUrl, token, filePath) {
  const fileName = path.basename(filePath);
  const targetUrl = `${uploadUrl}?name=${encodeURIComponent(fileName)}`;
  const buffer = fs.readFileSync(filePath);
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "order-codemagic-release-upload",
      "Content-Type": getUploadContentType(filePath),
      "Content-Length": String(buffer.length),
    },
    body: buffer,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Upload failed for ${fileName}: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  const { repo, tag, dir, exts } = parseArgs(process.argv);
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error("Missing GITHUB_TOKEN.");
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid repo slug: ${repo}`);
  }

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter((filePath) => exts.includes(path.extname(filePath).toLowerCase()))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "en"));

  if (entries.length === 0) {
    throw new Error(`No release assets found in ${dir} for extensions: ${exts.join(", ")}`);
  }

  let release = null;
  try {
    release = await githubRequest(
      `https://api.github.com/repos/${owner}/${repoName}/releases/tags/${encodeURIComponent(tag)}`,
      githubToken,
    );
  } catch (error) {
    if (!String(error.message).includes("404")) {
      throw error;
    }
  }

  if (!release) {
    release = await githubRequest(
      `https://api.github.com/repos/${owner}/${repoName}/releases`,
      githubToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag_name: tag,
          target_commitish: "main",
          name: `Order ${tag}`,
          body: `Automated release for ${tag}`,
          draft: false,
          prerelease: false,
        }),
      },
    );
  }

  const uploadUrl = String(release.upload_url || "").replace(/\{.*$/, "");
  if (!uploadUrl) {
    throw new Error("Release upload_url is missing.");
  }

  const existingAssets = Array.isArray(release.assets) ? release.assets : [];
  for (const filePath of entries) {
    const fileName = path.basename(filePath);
    for (const asset of existingAssets.filter((item) => item.name === fileName)) {
      await githubRequest(
        `https://api.github.com/repos/${owner}/${repoName}/releases/assets/${asset.id}`,
        githubToken,
        { method: "DELETE" },
      );
    }
    const uploaded = await uploadAsset(uploadUrl, githubToken, filePath);
    console.log(`Uploaded ${uploaded?.name || fileName}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
