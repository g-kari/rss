import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimeline } from "animejs/timeline";
import { CINEMATIC_DURATION } from "../hooks/useCinematicPlayback";

afterEach(() => {
  document.body.replaceChildren();
});

describe("pinned Anime.js timeline contract", () => {
  it("seeks the actual image choreography and reverts styles without autoplay", () => {
    const image = document.createElement("div");
    image.style.opacity = "0.7";
    document.body.appendChild(image);
    const complete = vi.fn();
    const update = vi.fn();
    const timeline = createTimeline({
      autoplay: false,
      onComplete: complete,
      onUpdate: update,
    }).add(image, {
      scale: [1, 1.1],
      x: [0, -8],
      y: [0, -4],
      duration: CINEMATIC_DURATION,
      ease: "linear",
    });
    expect(timeline.paused).toBe(true);
    expect(timeline.duration).toBe(20_000);
    timeline.seek(10_000);
    expect(timeline.currentTime).toBe(10_000);
    expect(image.style.transform).toContain("1.05");
    expect(update).toHaveBeenCalled();
    timeline.seek(20_000);
    expect(complete).toHaveBeenCalledOnce();
    timeline.seek(0, true);
    expect(timeline.currentTime).toBe(0);
    timeline.revert();
    expect(image.style.transform).toBe("");
    expect(image.style.opacity).toBe("0.7");
  });
});
