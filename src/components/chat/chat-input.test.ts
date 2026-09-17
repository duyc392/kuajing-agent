// 用途：新旧输入外观、输入保留和中文输入法防误发送回归，不调用模型或数据库。
import test from "node:test";
import assert from "node:assert/strict";
import React, { type ComponentProps, type KeyboardEvent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatInput } from "./chat-input";

type Props = ComponentProps<typeof ChatInput>;
const defaults: Props = { value: "", onChange: () => undefined, disabled: false, onSubmit: () => undefined };

function inputElement(props: Props): ReactElement<ComponentProps<"textarea">> {
  const root = ChatInput(props);
  const form = React.Children.toArray(root.props.children)[0] as ReactElement<ComponentProps<"form">>;
  const input = React.Children.toArray(form.props.children).find((child) => React.isValidElement(child) && child.type === "textarea");
  assert.ok(React.isValidElement(input));
  return input as ReactElement<ComponentProps<"textarea">>;
}

function pressEnter(input: ReactElement<ComponentProps<"textarea">>, overrides: Partial<KeyboardEvent<HTMLTextAreaElement>> = {}) {
  let prevented = false;
  const event = {
    key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false },
    preventDefault: () => { prevented = true; }, ...overrides,
  } as KeyboardEvent<HTMLTextAreaElement>;
  input.props.onKeyDown?.(event);
  return prevented;
}

test("默认输入框保留发送文案、长度限制及空输入禁用", () => {
  const html = renderToStaticMarkup(React.createElement(ChatInput, defaults));
  assert.match(html, /maxLength="20000"/i);
  assert.match(html, /发送<\/button>/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /workspace-composer/);
});

test("首页外观展示当前店铺，非空任务可提交，输入值保持", () => {
  const html = renderToStaticMarkup(React.createElement(ChatInput, { ...defaults, value: "写一个脚本", appearance: "home", shopName: "测试店" }));
  assert.match(html, /workspace-composer/);
  assert.match(html, /当前店铺：测试店/);
  assert.match(html, /写一个脚本/);
  assert.match(html, /开始任务/);
  assert.doesNotMatch(html, /disabled=""/);
});

test("处理中禁用输入和提交，不因切换外观改变禁用行为", () => {
  for (const appearance of ["default", "home"] as const) {
    const html = renderToStaticMarkup(React.createElement(ChatInput, { ...defaults, appearance, value: "任务", disabled: true }));
    assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  }
});

test("Enter只发送一次；Shift+Enter保留换行", () => {
  let sends = 0;
  const input = inputElement({ ...defaults, value: "任务", onSubmit: () => { sends++; } });
  assert.equal(pressEnter(input), true);
  assert.equal(sends, 1);
  assert.equal(pressEnter(input, { shiftKey: true }), false);
  assert.equal(sends, 1);
});

test("中文输入法选词回车和229兼容事件不误发送", () => {
  let sends = 0;
  const input = inputElement({ ...defaults, onSubmit: () => { sends++; } });
  assert.equal(pressEnter(input, { nativeEvent: { isComposing: true } as globalThis.KeyboardEvent }), false);
  assert.equal(pressEnter(input, { keyCode: 229 }), false);
  assert.equal(sends, 0);
});

test("首页无店铺仅禁用，不误报正在开始任务", () => {
  const html = renderToStaticMarkup(React.createElement(ChatInput, { ...defaults, appearance: "home", disabled: true, busy: false }));
  assert.match(html, /开始任务/);
  assert.doesNotMatch(html, /正在开始/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});
