"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRobot = normalizeRobot;
const healthCheckUrdf_1 = require("../analysis/healthCheckUrdf");
const rotateRobot_1 = require("../utils/rotateRobot");
const canonicalOrdering_1 = require("../utils/canonicalOrdering");
const normalizeJointAxes_1 = require("../utils/normalizeJointAxes");
const prettyPrintURDF_1 = require("../utils/prettyPrintURDF");
const canonicalizeJointFrames_1 = require("../transforms/canonicalizeJointFrames");
function normalizeRobot(urdfContent, options = {}) {
    const healthBefore = (0, healthCheckUrdf_1.healthCheckUrdf)(urdfContent, {
        axisSnapTolerance: options.axisSnapTolerance,
    });
    const plannedSteps = [
        {
            name: "health-check",
            enabled: true,
            reason: "Always runs first to produce structural and physical findings.",
        },
        {
            name: "snap-axes",
            enabled: options.snapAxes ?? false,
            reason: options.snapAxes
                ? "Enabled explicitly."
                : "Disabled by default; enable when near-canonical axes should become exact basis vectors.",
        },
        {
            name: "apply-orientation",
            enabled: Boolean(options.sourceUpAxis && options.sourceForwardAxis),
            reason: options.sourceUpAxis && options.sourceForwardAxis
                ? "Source orientation was provided explicitly."
                : "No explicit source orientation was provided.",
        },
        {
            name: "canonicalize-joint-frame",
            enabled: options.canonicalizeJointFrame ?? false,
            reason: options.canonicalizeJointFrame
                ? `Enabled explicitly with target axis ${options.targetJointAxis ?? "z"}.`
                : "Disabled by default; enable when simulator control expects a canonical joint-local axis.",
        },
        {
            name: "pretty-print",
            enabled: options.prettyPrint ?? false,
            reason: options.prettyPrint ? "Enabled explicitly." : "Disabled by default.",
        },
        {
            name: "canonical-order",
            enabled: options.canonicalOrder ?? false,
            reason: options.canonicalOrder ? "Enabled explicitly." : "Disabled by default.",
        },
    ];
    if (!options.apply) {
        return {
            apply: false,
            plannedSteps,
            healthBefore,
        };
    }
    let current = urdfContent;
    const normalization = {};
    if (options.snapAxes) {
        const snapped = (0, normalizeJointAxes_1.snapJointAxes)(current, {
            snapTolerance: options.axisSnapTolerance,
        });
        normalization.snappedAxes = snapped;
        current = snapped.urdfContent;
    }
    if (options.sourceUpAxis && options.sourceForwardAxis) {
        current = (0, rotateRobot_1.applyOrientationToRobot)(current, {
            sourceUpAxis: options.sourceUpAxis,
            sourceForwardAxis: options.sourceForwardAxis,
            targetUpAxis: options.targetUpAxis ?? "+z",
            targetForwardAxis: options.targetForwardAxis ?? "+x",
        });
    }
    if (options.canonicalizeJointFrame) {
        const canonicalized = (0, canonicalizeJointFrames_1.canonicalizeJointFrames)(current, {
            targetAxis: options.targetJointAxis ?? "z",
        });
        normalization.canonicalizedJointFrames = canonicalized;
        current = canonicalized.content;
    }
    if (options.prettyPrint) {
        current = (0, prettyPrintURDF_1.prettyPrintURDF)(current, 2);
    }
    if (options.canonicalOrder) {
        current = (0, canonicalOrdering_1.canonicalOrderURDF)(current);
    }
    return {
        apply: true,
        plannedSteps,
        healthBefore,
        healthAfter: (0, healthCheckUrdf_1.healthCheckUrdf)(current, {
            axisSnapTolerance: options.axisSnapTolerance,
        }),
        normalization,
        outputUrdf: current,
    };
}
