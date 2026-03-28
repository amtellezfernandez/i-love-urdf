import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-gallery-publish-"));
process.on("exit", () => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const { buildGalleryPublishDraft } = await import(
  path.join("/home/am/dev/i-love-urdf", "dist", "gallery", "galleryPublish.js")
);

test("gallery publish draft omits missing webm entries for image-only renders", async () => {
  const outputRoot = fs.mkdtempSync(path.join(tempRoot, "image-only-"));
  const thumbnailPath = path.join(outputRoot, "thumbnail.png");
  fs.writeFileSync(thumbnailPath, "png-bytes");

  const manifestPath = path.join(outputRoot, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        outputRoot,
        catalogSnapshot: {
          repoEntries: [],
          previewEntries: [],
        },
        items: [
          {
            candidatePath: "robots/demo/demo.urdf",
            sourcePath: "robots/demo/demo.urdf",
            galleryRepoKey: "acme/robot",
            galleryFileBase: "demo",
            galleryPngPath: "thumbnails/acme/robot/demo.png",
            galleryWebmPath: "",
            thumbnailPath,
            videoPath: "",
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  const draft = await buildGalleryPublishDraft({
    jobId: "job-12345678",
    source: {
      owner: "acme",
      repo: "robot",
    },
    repoMetadata: {},
    items: [{ id: "robots/demo/demo.urdf", title: "Demo" }],
    manifestPath,
  });

  const previewsFile = draft.files.find((file) => file.path == "docs/previews.json");
  assert.ok(previewsFile);
  const previewsPayload = JSON.parse(previewsFile.content);
  assert.deepEqual(previewsPayload.previews, [
    {
      repoKey: "acme/robot",
      fileBase: "demo",
      sourceType: "urdf",
      tags: ["source:urdf"],
      png: "thumbnails/acme/robot/demo.png",
    },
  ]);
  assert.equal(
    draft.files.some((file) => file.path == "docs/previews/acme/robot/demo.webm"),
    false
  );
});

test("gallery publish draft preserves existing preview manifest fields during regeneration", async () => {
  const outputRoot = fs.mkdtempSync(path.join(tempRoot, "preserve-preview-fields-"));
  const thumbnailPath = path.join(outputRoot, "thumbnail.png");
  const videoPath = path.join(outputRoot, "preview.webm");
  fs.writeFileSync(thumbnailPath, "png-bytes");
  fs.writeFileSync(videoPath, "webm-bytes");

  const manifestPath = path.join(outputRoot, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        outputRoot,
        catalogSnapshot: {
          repoEntries: [],
          previewEntries: [
            {
              repoKey: "acme/robot",
              fileBase: "demo",
              sourceType: "urdf",
              tags: ["source:urdf"],
              png: "thumbnails/acme/robot/demo.png",
              webm: "previews/acme/robot/demo.webm",
              webp: "previews/acme/robot/demo.webp",
              mp4: "previews/acme/robot/demo.mp4",
            },
          ],
        },
        items: [
          {
            candidatePath: "robots/demo/demo.urdf",
            sourcePath: "robots/demo/demo.urdf",
            galleryRepoKey: "acme/robot",
            galleryFileBase: "demo",
            galleryPngPath: "thumbnails/acme/robot/demo.png",
            galleryWebmPath: "previews/acme/robot/demo.webm",
            thumbnailPath,
            videoPath,
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  const draft = await buildGalleryPublishDraft({
    jobId: "job-87654321",
    source: {
      owner: "acme",
      repo: "robot",
    },
    repoMetadata: {},
    items: [{ id: "robots/demo/demo.urdf", title: "Demo" }],
    manifestPath,
  });

  const previewsFile = draft.files.find((file) => file.path == "docs/previews.json");
  assert.ok(previewsFile);
  const previewsPayload = JSON.parse(previewsFile.content);
  assert.deepEqual(previewsPayload.previews, [
    {
      repoKey: "acme/robot",
      fileBase: "demo",
      sourceType: "urdf",
      tags: ["source:urdf"],
      png: "thumbnails/acme/robot/demo.png",
      webm: "previews/acme/robot/demo.webm",
      webp: "previews/acme/robot/demo.webp",
      mp4: "previews/acme/robot/demo.mp4",
    },
  ]);
});
