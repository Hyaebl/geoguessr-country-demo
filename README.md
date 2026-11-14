# GeoGuessr country demo

Static browser deployment of the 40-country model from [GeoguessrBot](https://github.com/EricRiddle9185/GeoguessrBot).

Predictions run on the visitor's device with ONNX Runtime Web. Images are not uploaded to an inference server. The first prediction downloads about 111 MB of model and runtime files.

GitHub Pages serves the root of the `gh-pages` branch. `browser_export.json` records the checkpoint and model-conversion checks. Runtime licensing and third-party notices are in `vendor`.
