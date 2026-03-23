"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSensors = exports.parseSensorsFromDocument = void 0;
const xmlDom_1 = require("../xmlDom");
const parseVector3 = (text, fallback) => {
    if (!text)
        return fallback;
    const parts = text.trim().split(/\s+/).map((v) => Number(v));
    return [
        Number.isFinite(parts[0]) ? parts[0] : fallback[0],
        Number.isFinite(parts[1]) ? parts[1] : fallback[1],
        Number.isFinite(parts[2]) ? parts[2] : fallback[2],
    ];
};
const parseNumber = (value) => {
    if (!value)
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const parseNoise = (element) => {
    if (!element)
        return undefined;
    const noise = {};
    const type = element.getAttribute("type");
    if (type)
        noise.type = type;
    const mean = parseNumber(element.querySelector("mean")?.textContent || null);
    const stddev = parseNumber(element.querySelector("stddev")?.textContent || null);
    const biasMean = parseNumber(element.querySelector("bias_mean")?.textContent || null);
    const biasStddev = parseNumber(element.querySelector("bias_stddev")?.textContent || null);
    if (mean !== undefined)
        noise.mean = mean;
    if (stddev !== undefined)
        noise.stddev = stddev;
    if (biasMean !== undefined)
        noise.biasMean = biasMean;
    if (biasStddev !== undefined)
        noise.biasStddev = biasStddev;
    return Object.keys(noise).length ? noise : undefined;
};
const parseOrigin = (element) => {
    if (!element) {
        return { xyz: [0, 0, 0], rpy: [0, 0, 0] };
    }
    const xyzAttr = element.getAttribute("xyz");
    const rpyAttr = element.getAttribute("rpy");
    if (xyzAttr || rpyAttr) {
        const xyz = parseVector3(xyzAttr, [0, 0, 0]);
        const rpy = parseVector3(rpyAttr, [0, 0, 0]);
        return { xyz, rpy };
    }
    const text = element.textContent?.trim();
    if (text) {
        const parts = text.split(/\s+/).map((v) => Number(v));
        return {
            xyz: [
                Number.isFinite(parts[0]) ? parts[0] : 0,
                Number.isFinite(parts[1]) ? parts[1] : 0,
                Number.isFinite(parts[2]) ? parts[2] : 0,
            ],
            rpy: [
                Number.isFinite(parts[3]) ? parts[3] : 0,
                Number.isFinite(parts[4]) ? parts[4] : 0,
                Number.isFinite(parts[5]) ? parts[5] : 0,
            ],
        };
    }
    return { xyz: [0, 0, 0], rpy: [0, 0, 0] };
};
const parseCamera = (sensor) => {
    const camera = sensor.querySelector("camera");
    if (!camera)
        return undefined;
    const info = {};
    info.horizontalFov = parseNumber(camera.querySelector("horizontal_fov")?.textContent || null);
    info.width = parseNumber(camera.querySelector("image > width")?.textContent || null);
    info.height = parseNumber(camera.querySelector("image > height")?.textContent || null);
    const format = camera.querySelector("image > format")?.textContent || null;
    if (format)
        info.format = format.trim();
    info.nearClip = parseNumber(camera.querySelector("clip > near")?.textContent || null);
    info.farClip = parseNumber(camera.querySelector("clip > far")?.textContent || null);
    info.noise = parseNoise(camera.querySelector("noise"));
    return info;
};
const parseLidar = (sensor) => {
    const ray = sensor.querySelector("ray");
    if (!ray)
        return undefined;
    const info = {};
    info.horizontalSamples = parseNumber(ray.querySelector("scan > horizontal > samples")?.textContent || null);
    info.horizontalResolution = parseNumber(ray.querySelector("scan > horizontal > resolution")?.textContent || null);
    info.horizontalMinAngle = parseNumber(ray.querySelector("scan > horizontal > min_angle")?.textContent || null);
    info.horizontalMaxAngle = parseNumber(ray.querySelector("scan > horizontal > max_angle")?.textContent || null);
    info.verticalSamples = parseNumber(ray.querySelector("scan > vertical > samples")?.textContent || null);
    info.verticalResolution = parseNumber(ray.querySelector("scan > vertical > resolution")?.textContent || null);
    info.verticalMinAngle = parseNumber(ray.querySelector("scan > vertical > min_angle")?.textContent || null);
    info.verticalMaxAngle = parseNumber(ray.querySelector("scan > vertical > max_angle")?.textContent || null);
    info.rangeMin = parseNumber(ray.querySelector("range > min")?.textContent || null);
    info.rangeMax = parseNumber(ray.querySelector("range > max")?.textContent || null);
    info.rangeResolution = parseNumber(ray.querySelector("range > resolution")?.textContent || null);
    info.noise = parseNoise(ray.querySelector("noise"));
    return info;
};
const parseImu = (sensor) => {
    const imu = sensor.querySelector("imu");
    if (!imu)
        return undefined;
    const info = {};
    info.angularVelocityNoise = parseNoise(imu.querySelector("angular_velocity > noise"));
    info.linearAccelerationNoise = parseNoise(imu.querySelector("linear_acceleration > noise"));
    return info;
};
const parseGps = (sensor) => {
    const gps = sensor.querySelector("gps");
    if (!gps)
        return undefined;
    const info = {};
    info.positionSensingHorizontalNoise = parseNoise(gps.querySelector("position_sensing > horizontal > noise"));
    info.positionSensingVerticalNoise = parseNoise(gps.querySelector("position_sensing > vertical > noise"));
    info.velocitySensingHorizontalNoise = parseNoise(gps.querySelector("velocity_sensing > horizontal > noise"));
    info.velocitySensingVerticalNoise = parseNoise(gps.querySelector("velocity_sensing > vertical > noise"));
    return info;
};
const parseContact = (sensor) => {
    const contact = sensor.querySelector("contact");
    if (!contact)
        return undefined;
    const info = {};
    const collision = contact.querySelector("collision")?.textContent || null;
    if (collision)
        info.collision = collision.trim();
    info.noise = parseNoise(contact.querySelector("noise"));
    return info;
};
const parseForceTorque = (sensor) => {
    const ft = sensor.querySelector("force_torque");
    if (!ft)
        return undefined;
    const info = {};
    const frame = ft.querySelector("frame")?.textContent || null;
    const measureDirection = ft.querySelector("measure_direction")?.textContent || null;
    if (frame)
        info.frame = frame.trim();
    if (measureDirection)
        info.measureDirection = measureDirection.trim();
    info.noise = parseNoise(ft.querySelector("noise"));
    return info;
};
const parseSensorsFromDocument = (xmlDoc) => {
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError)
        return [];
    const sensors = [];
    const gazeboBlocks = Array.from(xmlDoc.querySelectorAll("gazebo"));
    for (const gazebo of gazeboBlocks) {
        const reference = gazebo.getAttribute("reference");
        const sensorElements = Array.from(gazebo.querySelectorAll("sensor"));
        for (const sensor of sensorElements) {
            const name = sensor.getAttribute("name") || "sensor";
            const type = sensor.getAttribute("type") || "sensor";
            const linkName = reference || sensor.getAttribute("link") || null;
            const updateRate = parseNumber(sensor.querySelector("update_rate")?.textContent || null);
            const topic = sensor.querySelector("topic")?.textContent || null;
            const visualize = sensor.querySelector("visualize")?.textContent?.trim() === "true";
            const alwaysOn = sensor.querySelector("always_on")?.textContent?.trim() === "true";
            const origin = parseOrigin(sensor.querySelector("pose"));
            const plugin = sensor.querySelector("plugin");
            const pluginFilename = plugin?.getAttribute("filename") || null;
            const pluginRawXml = plugin ? plugin.innerHTML : null;
            sensors.push({
                name,
                type,
                linkName,
                updateRate,
                topic: topic ? topic.trim() : undefined,
                visualize,
                alwaysOn,
                origin,
                camera: parseCamera(sensor),
                lidar: parseLidar(sensor),
                imu: parseImu(sensor),
                gps: parseGps(sensor),
                contact: parseContact(sensor),
                forceTorque: parseForceTorque(sensor),
                pluginFilename,
                pluginRawXml,
            });
        }
    }
    return sensors;
};
exports.parseSensorsFromDocument = parseSensorsFromDocument;
const parseSensors = (urdfContent) => {
    try {
        const xmlDoc = (0, xmlDom_1.parseXml)(urdfContent);
        return (0, exports.parseSensorsFromDocument)(xmlDoc);
    }
    catch {
        return [];
    }
};
exports.parseSensors = parseSensors;
