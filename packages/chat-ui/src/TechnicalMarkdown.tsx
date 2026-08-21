"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

function safeUrl(value: string): string {
  try {
    const url = new URL(value, "https://docs.liara.ir");
    return url.protocol === "https:" || url.protocol === "http:" ? value : "";
  } catch {
    return "";
  }
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("کپی شد");
    } catch {
      setStatus("کپی ناموفق بود");
    }
  }
  return (
    <div className="hackathon-chat__code-block" dir="ltr">
      <div className="hackathon-chat__code-toolbar">
        <bdi>{language || "text"}</bdi>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`کپی کد ${language || "text"}`}
        >
          کپی
        </button>
      </div>
      <pre dir="ltr">
        <code className={language ? `language-${language}` : undefined}>
          {code}
        </code>
      </pre>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}

function MarkdownText({ content }: { content: string }) {
  return (
    <ReactMarkdown
      skipHtml
      allowedElements={[
        "p",
        "strong",
        "em",
        "del",
        "blockquote",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "hr",
        "br",
        "a",
        "code",
      ]}
      urlTransform={safeUrl}
      components={{
        a: ({ href, children }) =>
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              <bdi dir="auto">{children}</bdi>
            </a>
          ) : (
            <span>{children}</span>
          ),
        code: ({ children }) => (
          <code dir="ltr">
            <bdi>{children}</bdi>
          </code>
        ),
        p: ({ children }) => <p dir="auto">{children}</p>,
      }}
    >
      {content.replace(/^- \[ \] /gm, "- ☐ ").replace(/^- \[x\] /gim, "- ☑ ")}
    </ReactMarkdown>
  );
}

function Table({ lines }: { lines: string[] }) {
  const cells = (line: string) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((value) => value.trim());
  const headers = cells(lines[0]!);
  const rows = lines.slice(2).map(cells);
  return (
    <div
      className="hackathon-chat__table-scroll"
      tabIndex={0}
      aria-label="جدول قابل پیمایش"
    >
      <table>
        <thead>
          <tr>
            {headers.map((cell, index) => (
              <th key={index} scope="col" dir="auto">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index} dir="auto">
                  <bdi>{cell}</bdi>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderTables(content: string, keyPrefix: string): ReactNode[] {
  const lines = content.split("\n");
  const output: ReactNode[] = [];
  let text: string[] = [];
  const flush = () => {
    if (text.join("\n").trim())
      output.push(
        <MarkdownText
          key={`${keyPrefix}-m-${output.length}`}
          content={text.join("\n")}
        />,
      );
    text = [];
  };
  for (let index = 0; index < lines.length; ) {
    if (
      lines[index]?.includes("|") &&
      /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")
    ) {
      flush();
      const table = [lines[index]!, lines[index + 1]!];
      index += 2;
      while (index < lines.length && lines[index]!.includes("|"))
        table.push(lines[index++]!);
      output.push(
        <Table key={`${keyPrefix}-t-${output.length}`} lines={table} />,
      );
      continue;
    }
    text.push(lines[index++]!);
  }
  flush();
  return output;
}

export function TechnicalMarkdown({ content }: { content: string }) {
  const nodes: ReactNode[] = [];
  const expression = /^```([A-Za-z0-9_+.-]*)\s*\n([\s\S]*?)^```\s*$/gm;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(content))) {
    nodes.push(
      ...renderTables(
        content.slice(start, match.index),
        `before-${match.index}`,
      ),
    );
    nodes.push(
      <CodeBlock
        key={`code-${match.index}`}
        language={match[1] ?? ""}
        code={(match[2] ?? "").replace(/\n$/, "")}
      />,
    );
    start = expression.lastIndex;
  }
  nodes.push(...renderTables(content.slice(start), `after-${start}`));
  return (
    <div className="hackathon-chat__markdown" dir="rtl">
      {nodes}
    </div>
  );
}
