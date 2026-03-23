export type SensorOrigin = {
    xyz: [number, number, number];
    rpy: [number, number, number];
};
export type SensorNoise = {
    type?: string;
    mean?: number;
    stddev?: number;
    biasMean?: number;
    biasStddev?: number;
};
export type CameraSensor = {
    horizontalFov?: number;
    width?: number;
    height?: number;
    format?: string;
    nearClip?: number;
    farClip?: number;
    noise?: SensorNoise;
};
export type LidarSensor = {
    horizontalSamples?: number;
    horizontalResolution?: number;
    horizontalMinAngle?: number;
    horizontalMaxAngle?: number;
    verticalSamples?: number;
    verticalResolution?: number;
    verticalMinAngle?: number;
    verticalMaxAngle?: number;
    rangeMin?: number;
    rangeMax?: number;
    rangeResolution?: number;
    noise?: SensorNoise;
};
export type ImuSensor = {
    angularVelocityNoise?: SensorNoise;
    linearAccelerationNoise?: SensorNoise;
};
export type GpsSensor = {
    positionSensingHorizontalNoise?: SensorNoise;
    positionSensingVerticalNoise?: SensorNoise;
    velocitySensingHorizontalNoise?: SensorNoise;
    velocitySensingVerticalNoise?: SensorNoise;
};
export type ContactSensor = {
    collision?: string;
    noise?: SensorNoise;
};
export type ForceTorqueSensor = {
    frame?: string;
    measureDirection?: string;
    noise?: SensorNoise;
};
export type ParsedSensor = {
    name: string;
    type: string;
    linkName: string | null;
    updateRate?: number;
    topic?: string;
    visualize?: boolean;
    alwaysOn?: boolean;
    origin: SensorOrigin;
    camera?: CameraSensor;
    lidar?: LidarSensor;
    imu?: ImuSensor;
    gps?: GpsSensor;
    contact?: ContactSensor;
    forceTorque?: ForceTorqueSensor;
    pluginFilename?: string | null;
    pluginRawXml?: string | null;
};
export declare const parseSensorsFromDocument: (xmlDoc: Document) => ParsedSensor[];
export declare const parseSensors: (urdfContent: string) => ParsedSensor[];
