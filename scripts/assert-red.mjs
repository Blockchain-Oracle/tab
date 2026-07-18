import { spawnSync } from "node:child_process";

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const argumentsList = process.argv.slice(2);
const expectationIndex = argumentsList.indexOf("--expect");
const separatorIndex = argumentsList.indexOf("--");

if (
  expectationIndex < 0 ||
  separatorIndex < 0 ||
  expectationIndex + 1 >= separatorIndex ||
  separatorIndex === argumentsList.length - 1
) {
  throw new Error("Usage: assert-red --expect <marker> -- <command> [arguments...]");
}

const expectedMarker = argumentsList[expectationIndex + 1];
if (!expectedMarker || expectedMarker.length > 200) {
  throw new Error("The RED marker is invalid.");
}

const [command, ...commandArguments] = argumentsList.slice(separatorIndex + 1);
const result = spawnSync(command, commandArguments, {
  encoding: "utf8",
  env: process.env,
  maxBuffer: MAX_OUTPUT_BYTES,
  shell: false,
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.error) throw result.error;
if (result.signal) throw new Error(`The RED command ended with signal ${result.signal}.`);
if (result.status === 0) {
  throw new Error(`Expected the RED command to fail with ${expectedMarker}.`);
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
if (!output.includes(expectedMarker)) {
  throw new Error(`The command failed for the wrong reason; missing ${expectedMarker}.`);
}

process.stdout.write(`Confirmed RED: ${expectedMarker}\n`);
