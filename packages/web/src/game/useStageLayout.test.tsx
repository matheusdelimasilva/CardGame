import { useRef } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { useStageLayout } from "./useStageLayout";

afterEach(() => vi.unstubAllGlobals());

function Screen() {
  const ref = useRef<HTMLDivElement>(null);
  const { shape, layout } = useStageLayout(ref, 2);
  return (
    <div
      ref={ref}
      data-stage-height={
        shape.kind === "portrait" ? shape.unit * layout.stage.h : null
      }
    />
  );
}

it("fits the viewport when the nickname field is focused and after the chat field loses focus", () => {
  let height = 844;
  let onResize: () => void = () => {};
  let onFocusOut: (event: { target: unknown }) => void = () => {};
  const chatInput = {
    classList: { contains: (name: string) => name === "gs-chat-input" },
  };
  const nicknameInput = { classList: { contains: () => false } };
  const document: { activeElement: typeof nicknameInput | typeof chatInput } = {
    activeElement: nicknameInput,
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        onResize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const screen = {
    getBoundingClientRect: () => ({ width: 500, height }),
    querySelector: () => chatInput,
    contains: () => true,
    addEventListener: (_: string, listener: typeof onFocusOut) => {
      onFocusOut = listener;
    },
    removeEventListener() {},
  };
  const renderer = create(<Screen />, { createNodeMock: () => screen });
  const stageHeight = () =>
    renderer.root.findByType("div").props["data-stage-height"];
  try {
    expect(stageHeight()).toBeCloseTo(844);

    height = 700;
    act(onResize);
    expect(stageHeight()).toBeCloseTo(700);

    document.activeElement = chatInput;
    height = 550;
    act(onResize);
    expect(stageHeight()).toBeCloseTo(700);

    act(() => onFocusOut({ target: chatInput }));
    expect(stageHeight()).toBeCloseTo(550);
  } finally {
    act(() => renderer.unmount());
  }
});
