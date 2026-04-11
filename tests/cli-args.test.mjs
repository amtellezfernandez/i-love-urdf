import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const { createCliCommandHelpers, parseArgs } = await import(
  path.join("/home/am/dev/i-love-urdf", "dist", "commands", "cliArgs.js")
);

test("parseArgs preserves repeated flags for gallery render inputs", () => {
  const parsed = parseArgs([
    "node",
    "ilu",
    "gallery-render",
    "--urdf",
    "robots/alpha.urdf",
    "--urdf",
    "robots/beta.urdf",
    "--asset",
    "image",
    "--asset",
    "video",
  ]);

  assert.deepEqual(parsed.args.get("urdf"), ["robots/alpha.urdf", "robots/beta.urdf"]);
  assert.deepEqual(parsed.args.get("asset"), ["image", "video"]);
});

test("command helpers keep single-value compatibility by returning the last repeated string", () => {
  const { args } = parseArgs([
    "node",
    "ilu",
    "gallery-render",
    "--out",
    "/tmp/old",
    "--out",
    "/tmp/new",
  ]);
  const helpers = createCliCommandHelpers();

  assert.equal(helpers.getOptionalStringArg(args, "out"), "/tmp/new");
  assert.equal(helpers.requireStringArg(args, "out"), "/tmp/new");
});

test("delimited helpers include repeated and comma-delimited values", () => {
  const { args } = parseArgs([
    "node",
    "ilu",
    "inspect-meshes",
    "--mesh",
    "a.stl,b.stl",
    "--mesh",
    "c.stl",
  ]);
  const helpers = createCliCommandHelpers();

  assert.deepEqual(helpers.getDelimitedStringArg(args, "meshes", "mesh"), [
    "a.stl",
    "b.stl",
    "c.stl",
  ]);
});
