# Bundled rendering dependency record

SIMURA pins `postprocessing` **6.39.2** exactly. It is compatible with the project's three.js 0.170 line (`three >=0.168 <0.186`) and is distributed under the **Zlib** license. Its JavaScript and shaders are bundled by Vite; SIMURA does not load its code, lookup textures, fonts, images, or shaders from a CDN or other runtime origin.

The Phase-1 pipeline uses only bundled effects and a locally generated environment map. The production build audit rejects remote runtime URLs and CSS imports.
