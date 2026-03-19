export type OrientationVec3 = [number, number, number];
export type DirectionSample = {
    offset: OrientationVec3;
    distance: number;
};
export type PrincipalAxes = {
    primary: OrientationVec3;
    secondary: OrientationVec3;
    tertiary: OrientationVec3;
};
export type DirectionCue = {
    axis: OrientationVec3;
    confidence: number;
};
export declare const resolvePrincipalAxesFromDirectionSamples: (samples: DirectionSample[]) => PrincipalAxes | null;
export declare const resolveDirectionCueFromDirectionSamples: (samples: DirectionSample[]) => DirectionCue | null;
export declare const resolveUpCueFromDirectionSamples: (samples: DirectionSample[], forwardDirection: OrientationVec3, upReference: OrientationVec3) => DirectionCue | null;
