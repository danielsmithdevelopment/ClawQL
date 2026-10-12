module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // experiments.reactCompiler in app.config also enables this;
          // keep explicit so Metro picks it up with our custom babel.config.cjs.
          "react-compiler": {
            compilationMode: "infer",
          },
        },
      ],
    ],
    plugins: ["@expo/ui/babel-plugin"],
  };
};
