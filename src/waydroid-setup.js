import {
  CALIBRATED_DENSITY,
  CALIBRATED_HEIGHT,
  CALIBRATED_WIDTH,
  EGOV_PACKAGE,
  connectWaydroidAdb,
  parseAdbDevices,
  parseDisplaySize,
  runText,
  selectAdbDevice,
} from "./adb-device.js";

console.warn(
  "[deprecated] Waydroid support is retained only as an archived experiment. Do not sign sensitive accounts into this container.",
);
connectWaydroidAdb();
const devices = parseAdbDevices(runText("adb", ["devices", "-l"]));
const device = selectAdbDevice(devices, { mode: "waydroid" });
const adb = (args) => runText("adb", ["-s", device.serial, ...args]);

adb(["shell", "wm", "size", `${CALIBRATED_WIDTH}x${CALIBRATED_HEIGHT}`]);
adb(["shell", "wm", "density", String(CALIBRATED_DENSITY)]);
adb(["shell", "settings", "put", "global", "stay_on_while_plugged_in", "7"]);
adb(["shell", "settings", "put", "system", "screen_off_timeout", "2147483647"]);
adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
adb(["shell", "wm", "dismiss-keyguard"]);

const size = parseDisplaySize(adb(["shell", "wm", "size"]));
if (!size || size.width !== CALIBRATED_WIDTH || size.height !== CALIBRATED_HEIGHT) {
  throw new Error("Waydroid did not retain the calibrated display size.");
}

let packagePath = "";
try {
  packagePath = adb(["shell", "pm", "path", EGOV_PACKAGE]).trim();
} catch {
  // The actionable install message below is clearer than pm's exit status.
}

console.log(`Waydroid ADB device ready: ${device.serial}`);
console.log(`Display calibrated to ${CALIBRATED_WIDTH}x${CALIBRATED_HEIGHT} at ${CALIBRATED_DENSITY} dpi.`);
if (!packagePath.startsWith("package:")) {
  console.log("eGovPH is not installed yet. Install it from Play Store inside Waydroid, sign in, then rerun this command.");
  process.exitCode = 2;
} else {
  adb(["shell", "monkey", "-p", EGOV_PACKAGE, "-c", "android.intent.category.LAUNCHER", "1"]);
  console.log("eGovPH is installed and has been launched. Complete sign-in if needed, then run `npm run watch:waydroid`.");
}
