import assert from "node:assert/strict";
import { localeFromNavigator } from "./locale.js";

assert.equal(localeFromNavigator({ language: "zh-CN", languages: ["zh-CN"] }), "zh");
assert.equal(localeFromNavigator({ language: "zh-TW", languages: ["zh-TW", "en"] }), "zh");
assert.equal(localeFromNavigator({ language: "en-US", languages: ["en-US"] }), "en");
assert.equal(localeFromNavigator({ language: "ja-JP", languages: ["ja-JP", "en"] }), "en");
assert.equal(localeFromNavigator({ language: "en-US", languages: ["zh-Hans-CN", "en-US"] }), "zh");

console.log("localeFromNavigator ok");
