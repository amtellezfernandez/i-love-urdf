export type JointLinkValidationResult = {
    valid: true;
} | {
    valid: false;
    error: string;
};
export declare const validateJointLinkReassignment: (urdfContent: string, jointName: string, parentLink: string, childLink: string) => JointLinkValidationResult;
