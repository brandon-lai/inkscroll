# Third-party licenses

## shan-shui-inf

The landscape generators in `src/world/` (noise, drawing helpers, trees,
mountains, flat mounts, far mountains, rocks, architecture, water and the
mountain planner) are a TypeScript port of
[shan-shui-inf](https://github.com/LingDong-/shan-shui-inf) by Lingdong Huang,
used under the MIT License:

```
MIT License

Copyright (c) 2018 Lingdong Huang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

shan-shui-inf's Perlin noise is itself taken from
[p5.js](https://github.com/processing/p5.js/blob/main/src/math/noise.js)
(LGPL-2.1); `src/world/noise.ts` keeps that function's structure.

## JetBrains Mono

`public/fonts/jetbrains-mono-subset.woff2` is a subset of
[JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) 2.304, licensed
under the SIL Open Font License 1.1. The full license text is in
`public/fonts/OFL.txt`.

## Visual reference (no code used)

[Dao Ho's portfolio](https://github.com/Dao-Ho/portfolio) was studied for the
feel of always-slightly-moving ASCII. Its repository has no license file, so
no code from it is used here.
