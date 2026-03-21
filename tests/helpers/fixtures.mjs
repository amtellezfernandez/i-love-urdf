export const mobileManipulatorUrdf =
  "<robot name=\"dual_arm_mobile\">" +
  "<link name=\"base_link\"/>" +
  "<link name=\"left_shoulder_link\"/>" +
  "<link name=\"left_tool_link\"/>" +
  "<link name=\"right_shoulder_link\"/>" +
  "<link name=\"right_tool_link\"/>" +
  "<link name=\"front_left_wheel_link\"/>" +
  "<link name=\"front_right_wheel_link\"/>" +
  "<link name=\"rear_left_wheel_link\"/>" +
  "<link name=\"rear_right_wheel_link\"/>" +
  "<joint name=\"left_shoulder_joint\" type=\"revolute\"><parent link=\"base_link\"/><child link=\"left_shoulder_link\"/></joint>" +
  "<joint name=\"left_wrist_joint\" type=\"revolute\"><parent link=\"left_shoulder_link\"/><child link=\"left_tool_link\"/></joint>" +
  "<joint name=\"right_shoulder_joint\" type=\"revolute\"><parent link=\"base_link\"/><child link=\"right_shoulder_link\"/></joint>" +
  "<joint name=\"right_wrist_joint\" type=\"revolute\"><parent link=\"right_shoulder_link\"/><child link=\"right_tool_link\"/></joint>" +
  "<joint name=\"front_left_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"front_left_wheel_link\"/></joint>" +
  "<joint name=\"front_right_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"front_right_wheel_link\"/></joint>" +
  "<joint name=\"rear_left_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"rear_left_wheel_link\"/></joint>" +
  "<joint name=\"rear_right_wheel_joint\" type=\"continuous\"><parent link=\"base_link\"/><child link=\"rear_right_wheel_link\"/></joint>" +
  "</robot>";

export const wheeledRobotZUp =
  "<robot name=\"wheeled_z_up\">" +
  "<link name=\"base\"><collision><geometry><box size=\"1 0.4 0.2\"/></geometry></collision></link>" +
  "<link name=\"left_wheel\"><collision><origin xyz=\"0 0 0\" rpy=\"1.57079632679 0 0\"/><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<link name=\"right_wheel\"><collision><origin xyz=\"0 0 0\" rpy=\"1.57079632679 0 0\"/><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<joint name=\"left_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"left_wheel\"/><origin xyz=\"0 0.3 -0.1\" rpy=\"0 0 0\"/><axis xyz=\"0 1 0\"/></joint>" +
  "<joint name=\"right_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"right_wheel\"/><origin xyz=\"0 -0.3 -0.1\" rpy=\"0 0 0\"/><axis xyz=\"0 1 0\"/></joint>" +
  "</robot>";

export const wheeledRobotYUp =
  "<robot name=\"wheeled_y_up\">" +
  "<link name=\"base\"><collision><geometry><box size=\"1 0.2 0.5\"/></geometry></collision></link>" +
  "<link name=\"left_wheel\"><collision><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<link name=\"right_wheel\"><collision><geometry><cylinder radius=\"0.1\" length=\"0.05\"/></geometry></collision></link>" +
  "<joint name=\"left_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"left_wheel\"/><origin xyz=\"0 -0.1 0.3\" rpy=\"0 0 0\"/><axis xyz=\"0 0 1\"/></joint>" +
  "<joint name=\"right_wheel_joint\" type=\"continuous\"><parent link=\"base\"/><child link=\"right_wheel\"/><origin xyz=\"0 -0.1 -0.3\" rpy=\"0 0 0\"/><axis xyz=\"0 0 1\"/></joint>" +
  "</robot>";

export const badInertiaUrdf =
  "<robot name=\"bad_inertia\">" +
  "<link name=\"base\"><inertial><mass value=\"1\"/><origin xyz=\"0 0 0\" rpy=\"0 0 0\"/>" +
  "<inertia ixx=\"1\" ixy=\"0\" ixz=\"0\" iyy=\"0.1\" iyz=\"0\" izz=\"0.1\"/></inertial></link>" +
  "</robot>";

export const snapCandidateUrdf =
  "<robot name=\"snap_axes\"><link name=\"base\"/><link name=\"tip\"/>" +
  "<joint name=\"j\" type=\"continuous\"><parent link=\"base\"/><child link=\"tip\"/><axis xyz=\"0 0.99999 0.00001\"/></joint></robot>";

export const canonicalOrderingUrdf =
  "<robot name=\"ordering\">" +
  "<joint name=\"j\" type=\"continuous\"><child link=\"tip\"/><axis xyz=\"0 1 0\"/><parent link=\"base\"/></joint>" +
  "<link name=\"tip\"><inertial><inertia ixx=\"1\" ixy=\"0\" ixz=\"0\" iyy=\"1\" iyz=\"0\" izz=\"1\"/><mass value=\"1\"/><origin xyz=\"0 0 0\" rpy=\"0 0 0\"/></inertial><visual><material name=\"m\"/><geometry><box size=\"1 1 1\"/></geometry><origin xyz=\"0 0 0\" rpy=\"0 0 0\"/></visual></link>" +
  "<link name=\"base\"/>" +
  "</robot>";

export const rotationInvariantUrdf =
  "<robot name=\"rotation_invariant\"><link name=\"base\"/><link name=\"tip\"/>" +
  "<joint name=\"j\" type=\"continuous\"><parent link=\"base\"/><child link=\"tip\"/><origin xyz=\"1 2 3\" rpy=\"0 0 0\"/><axis xyz=\"1 0 0\"/></joint></robot>";
