"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSelectedJointNames = exports.createEditCommandContext = exports.emitWrittenPayload = exports.emitJson = void 0;
const emitJson = (value) => {
    console.log(JSON.stringify(value, null, 2));
};
exports.emitJson = emitJson;
const emitWrittenPayload = (helpers, outPath, writtenContent, payload) => {
    helpers.writeOutIfRequested(outPath, writtenContent);
    (0, exports.emitJson)({ ...payload, outPath: outPath || null });
};
exports.emitWrittenPayload = emitWrittenPayload;
const createEditCommandContext = (args, helpers) => {
    const urdfPath = helpers.getOptionalStringArg(args, "urdf");
    if (!urdfPath) {
        helpers.fail("Missing required argument --urdf");
    }
    return {
        args,
        helpers,
        urdfPath,
        urdfContent: helpers.readText(urdfPath),
        outPath: helpers.getOptionalStringArg(args, "out"),
    };
};
exports.createEditCommandContext = createEditCommandContext;
const readSelectedJointNames = (args, helpers) => helpers.getDelimitedStringArg(args, "joints", "joint");
exports.readSelectedJointNames = readSelectedJointNames;
