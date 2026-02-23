const { withProjectBuildGradle } = require('@expo/config-plugins');

function ensureExtAssignments(contents) {
  if (contents.includes('TextRecognition_compileSdkVersion') || contents.includes('TextRecognition_buildToolsVersion')) {
    return contents;
  }

  const extBlockRegex = /ext\s*\{[\s\S]*?\n\}/m;
  const match = contents.match(extBlockRegex);
  if (match) {
    const block = match[0];
    const insert =
      "\n    TextRecognition_compileSdkVersion = compileSdkVersion\n    TextRecognition_buildToolsVersion = buildToolsVersion\n";
    const updatedBlock = block.replace(/\n\}/, `${insert}\n}`);
    return contents.replace(block, updatedBlock);
  }

  // Fallback: create ext block if not present
  const allProjectsRegex = /allprojects\s*\{[\s\S]*?\n\}/m;
  const extBlock =
    "\n\next {\n    TextRecognition_compileSdkVersion = 36\n    TextRecognition_buildToolsVersion = \"36.0.0\"\n}\n";

  const allProjectsMatch = contents.match(allProjectsRegex);
  if (allProjectsMatch) {
    const ap = allProjectsMatch[0];
    return contents.replace(ap, `${ap}${extBlock}`);
  }

  return `${contents}${extBlock}`;
}

module.exports = function withTextRecognitionSdk(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    config.modResults.contents = ensureExtAssignments(config.modResults.contents);
    return config;
  });
};
