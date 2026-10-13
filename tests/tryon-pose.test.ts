import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectAnchors } from "@/lib/tryon";

const { detect } = vi.hoisted(() => ({ detect: vi.fn() }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  PoseLandmarker: { createFromOptions: async () => ({ detect }) },
}));

const image = {} as HTMLImageElement;
let pose: Array<{ x: number; y: number; visibility: number }>;
beforeEach(() => {
  pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  pose[12] = { x: 0.35, y: 0.2, visibility: 1 };
  pose[11] = { x: 0.65, y: 0.2, visibility: 1 };
  detect.mockImplementation(() => ({ landmarks: [pose] }));
});

describe("pose confidence", () => {
  it("maps confident landmarks to photo pixels", async () => {
    expect((await detectAnchors(image, 1000, 1000))?.shoulderL).toEqual({ x: 350, y: 200 });
  });

  it("rejects invisible shoulders instead of pretending the pose is reliable", async () => {
    pose[12].visibility = 0.1;
    expect(await detectAnchors(image, 1000, 1000)).toBeNull();
  });

  it("rejects incomplete pose results", async () => {
    pose.length = 10;
    expect(await detectAnchors(image, 1000, 1000)).toBeNull();
  });

  it("rejects non-finite coordinates", async () => {
    pose[23].x = Number.NaN;
    expect(await detectAnchors(image, 1000, 1000)).toBeNull();
  });

  it("rejects degenerate shoulder alignment", async () => {
    pose[11] = { ...pose[12] };
    expect(await detectAnchors(image, 1000, 1000)).toBeNull();
  });
});
