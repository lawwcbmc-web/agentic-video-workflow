import {Config} from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// NodeNext imports use .js specifiers; resolve their TypeScript sources in Webpack.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {...config.resolve, extensionAlias: {...config.resolve?.extensionAlias, ".js": [".js", ".ts", ".tsx"]}},
}));
