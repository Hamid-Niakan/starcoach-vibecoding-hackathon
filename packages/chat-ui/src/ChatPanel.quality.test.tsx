import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";

import { CitationList } from "./CitationList.js";
import { ChatEmptyState } from "./ChatEmptyState.js";
import { FeedbackControls } from "./FeedbackControls.js";
import { NewConversationButton } from "./NewConversationButton.js";
import { TechnicalMarkdown } from "./TechnicalMarkdown.js";

const revision = "a".repeat(64);
const citation = {
  id: "c1",
  marker: 1,
  passage_id: "passage-123456789",
  title: "Docker",
  url: "https://docs.liara.ir/paas/docker/",
  heading: "Deploy",
  documentation_revision: revision,
  validation: "valid" as const,
};

describe("quality chat primitives", () => {
  it("renders safe technical Markdown with LTR code, copy feedback, and scrollable tables", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
    const user = userEvent.setup();
    const { container } = render(
      <TechnicalMarkdown
        content={
          "```bash\nliara deploy\n```\n\n| کلید | مقدار |\n|---|---|\n| PORT | 8080 |\n\n[امن](https://docs.liara.ir/) [ناامن](javascript:alert(1))"
        }
      />,
    );
    expect(container.querySelector("pre[dir=ltr]")).toBeInTheDocument();
    expect(
      container.querySelector(".hackathon-chat__table-scroll"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "امن" })).toHaveAttribute(
      "rel",
      expect.stringContaining("noopener"),
    );
    expect(
      screen.queryByRole("link", { name: "ناامن" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /کپی کد bash/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("کپی شد");
  });

  it("renders validated sources with revision disclosure and noopener navigation", () => {
    render(
      <CitationList citations={[citation]} documentationRevision={revision} />,
    );
    expect(screen.getByRole("link", { name: /Docker/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByText(/نسخه مستندات/)).toBeVisible();
  });

  it("offers non-submitting examples and confirms destructive new-chat intent", async () => {
    const choose = vi.fn();
    const clear = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <ChatEmptyState onChoosePrompt={choose} />
        <NewConversationButton hasHistory onConfirm={clear} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: /استقرار Docker/ }));
    expect(choose).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "گفتگوی تازه" }));
    expect(
      await screen.findByText(/تاریخچه این برگه پاک می‌شود/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "پاک کردن و شروع" }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it("stores only enum feedback choices and exposes selected state", async () => {
    const change = vi.fn();
    const user = userEvent.setup();
    const view = render(<FeedbackControls value={null} onChange={change} />);
    await user.click(screen.getByRole("button", { name: "پاسخ مفید نبود" }));
    view.rerender(<FeedbackControls value="unhelpful" onChange={change} />);
    await user.click(screen.getByRole("button", { name: "جزئیات کافی نبود" }));
    expect(change).toHaveBeenLastCalledWith("unhelpful", "missing_detail");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("has no serious or critical axe violations in the composed quality states", async () => {
    const { container } = render(
      <main dir="rtl">
        <ChatEmptyState onChoosePrompt={() => undefined} />
        <TechnicalMarkdown content="متن `PORT=8080`" />
        <CitationList citations={[citation]} documentationRevision={revision} />
        <FeedbackControls value={null} onChange={() => undefined} />
      </main>,
    );
    const result = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      result.violations.filter(
        (item) => item.impact === "serious" || item.impact === "critical",
      ),
    ).toEqual([]);
  });
});
