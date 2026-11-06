// The page every lane renders: an issue-tracker style app plus a gallery that shows
// every variant of every recipe once. Only `./ui` differs between libraries: it maps
// (slot, variant) to that library's element or component.
import type { ReactNode } from "react";

import { RECIPE_KEYS } from "./catalog.gen";
import { ui } from "./ui";

declare const __BENCH_CARDS__: number;

type Props = { s: string; v?: string; children?: ReactNode; [prop: string]: unknown };

const N = ({ s, v, children, ...rest }: Props) => ui.node(s, v, rest, children);

const INTENTS = ["neutral", "accent", "success", "warning", "danger", "info"];
const PEOPLE = ["AL", "BK", "CM", "DN", "EO", "FP", "GQ", "HR"];
const STATUSES = ["Planned", "In progress", "Review", "Blocked", "Done", "Shipped"];

const Sidebar = () => (
  <N s="sidebar">
    <N s="brand">Tracker</N>
    <N s="sidebarTitle">Workspace</N>
    {["Inbox", "My issues", "Projects", "Cycles", "Roadmap", "Reports", "Settings"].map((label, i) => (
      <N key={label} s="navItem" v={i === 1 ? "accentSoftMd" : "neutralPlainMd"} href="#">
        {label}
      </N>
    ))}
    <N s="sidebarTitle">Teams</N>
    {INTENTS.map((intent) => (
      <N key={intent} s="navItem" v={`${intent}PlainSm`} href="#">
        <N s="statusDot" v={`${intent}Md`} />
        {intent}
      </N>
    ))}
  </N>
);

const Topbar = () => (
  <N s="topbar">
    <N s="brand">Release board</N>
    <N s="input" v="defaultFilledSm" placeholder="Search" aria-label="Search" style={{ width: 220 }} />
    <N s="iconButton" v="neutralGhostMd" aria-label="Notifications">
      ◎
    </N>
    <N s="avatar" v="accentCircleSm">
      AL
    </N>
  </N>
);

const Stats = () => (
  <N s="statGrid">
    {["Open", "In review", "Blocked", "Shipped"].map((label, i) => (
      <N key={label} s="stat">
        <N s="statLabel">{label}</N>
        <N s="statValue">{(i + 3) * 17}</N>
        <N s="inline">
          <N s="badge" v={`${INTENTS[i + 1]}SoftSm`}>
            {i % 2 ? "−" : "+"}
            {i + 4}%
          </N>
          <N s="muted">this week</N>
        </N>
      </N>
    ))}
  </N>
);

const Toolbar = () => (
  <N s="toolbar">
    <N s="button" v="accentSolidMd">
      New issue
    </N>
    <N s="button" v="neutralOutlineMd">
      Filter
    </N>
    <N s="toggleButton" v="neutralSoftMd" aria-pressed="true">
      Group
    </N>
    <N s="segmented">
      {["List", "Board", "Timeline"].map((label, i) => (
        <N key={label} s="segment" v={i === 0 ? "accentSoftSm" : "neutralGhostSm"}>
          {label}
        </N>
      ))}
    </N>
    <N s="spacer" />
    {INTENTS.slice(0, 4).map((intent) => (
      <N key={intent} s="chip" v={`${intent}OutlineSm`}>
        {intent}
      </N>
    ))}
  </N>
);

const Tabs = () => (
  <N s="inline">
    {["Overview", "Issues", "Activity", "Files"].map((label, i) => (
      <N key={label} s="tab" v={i === 1 ? "accentGhostMd" : "neutralGhostMd"}>
        {label}
      </N>
    ))}
  </N>
);

const Card = ({ index }: { index: number }) => {
  const intent = INTENTS[index % INTENTS.length]!;
  return (
    <N s="card" v={`${intent}ElevatedMd`} data-bench="card">
      <N s="inline">
        <N s="cardTitle">Issue #{1000 + index}</N>
        <N s="spacer" />
        <N s="statusDot" v={`${intent}Sm`} />
      </N>
      <N s="inline">
        <N s="tag" v={`${intent}SoftSm`}>
          {STATUSES[index % STATUSES.length]}
        </N>
        <N s="tag" v="neutralOutlineSm">
          v{(index % 9) + 1}.{index % 5}
        </N>
      </N>
      <N s="body">Ship the change behind a flag and watch the error budget for a day.</N>
      <N s="progressBar" v={`${intent}SoftSm`} />
      <N s="inline">
        {PEOPLE.slice(index % 4, (index % 4) + 3).map((person) => (
          <N key={person} s="avatar" v={`${intent}CircleXs`}>
            {person}
          </N>
        ))}
        <N s="spacer" />
        <N s="button" v={`${intent}GhostSm`}>
          Open
        </N>
      </N>
    </N>
  );
};

const Table = () => (
  <N s="tableWrap">
    <N s="table">
      <thead>
        <tr>
          {["Issue", "Status", "Owner", "Link"].map((label) => (
            <N key={label} s="th">
              {label}
            </N>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 12 }, (_, i) => {
          const intent = INTENTS[i % INTENTS.length]!;
          return (
            <N key={i} s="tableRow" v={`${intent}${i % 2 ? "Striped" : "Plain"}`}>
              <N s="td">
                <N s="code">ISS-{200 + i}</N>
              </N>
              <N s="td">
                <N s="badge" v={`${intent}SoftMd`}>
                  {STATUSES[i % STATUSES.length]}
                </N>
              </N>
              <N s="td">
                <N s="avatar" v={`${intent}RoundedSm`}>
                  {PEOPLE[i % PEOPLE.length]}
                </N>
              </N>
              <N s="td">
                <N s="link" v={`${intent}SubtleSm`} href="#">
                  details
                </N>
              </N>
            </N>
          );
        })}
      </tbody>
    </N>
  </N>
);

const Feedback = () => (
  <N s="stack">
    {INTENTS.map((intent) => (
      <N key={intent} s="alert" v={`${intent}SoftCompact`}>
        <strong>{intent}</strong> The nightly build finished with notes.
      </N>
    ))}
    <N s="toast" v="neutralSolidCompact">
      Saved
    </N>
    <N s="callout" v="infoOutlineComfortable">
      Deploys freeze on Friday at noon.
    </N>
    <N s="banner" v="warningSoftCompact">
      Maintenance window tonight.
    </N>
  </N>
);

const Form = () => (
  <N s="form">
    <N s="field">
      <N s="fieldLabel">Title</N>
      <N s="input" v="defaultOutlineMd" defaultValue="Cache the parsed config" />
      <N s="hint">Short and specific.</N>
    </N>
    <N s="field">
      <N s="fieldLabel">Priority</N>
      <N s="select" v="defaultOutlineMd" defaultValue="High">
        <option>Low</option>
        <option>High</option>
      </N>
    </N>
    <N s="field">
      <N s="fieldLabel">Estimate</N>
      <N s="input" v="invalidOutlineMd" defaultValue="soon" />
      <N s="hint">Use days.</N>
    </N>
    <N s="field">
      <N s="fieldLabel">Reviewer</N>
      <N s="input" v="validOutlineMd" defaultValue="BK" />
    </N>
    <N s="field">
      <N s="fieldLabel">Notes</N>
      <N s="textarea" v="defaultFilledMd" defaultValue="Measure before and after." />
    </N>
    <N s="stack">
      <N s="checkRow">
        <N s="checkbox" v="accentMd" />
        Notify watchers
      </N>
      <N s="checkRow">
        <N s="radio" v="accentMd" />
        Public
      </N>
      <N s="checkRow">
        <N s="switchControl" v="successMd" />
        Auto-close
      </N>
      <N s="checkRow">
        <N s="slider" v="accentMd" />
        Confidence
      </N>
      <N s="muted">
        Press <N s="kbd" v="outlineSm">⌘</N> <N s="kbd" v="outlineSm">K</N> to search
      </N>
    </N>
  </N>
);

const DialogPreview = () => (
  <N s="overlay">
    <N s="dialog">
      <N s="cardTitle">Close the cycle?</N>
      <N s="body">Open issues move to the next cycle.</N>
      <N s="menuItem" v="neutralPlainMd">
        Move open issues
      </N>
      <N s="menuItem" v="dangerSoftMd">
        Archive them
      </N>
      <N s="dialogFooter">
        <N s="button" v="neutralOutlineMd">
          Cancel
        </N>
        <N s="button" v="dangerSolidMd">
          Close cycle
        </N>
      </N>
    </N>
  </N>
);

const LIST_TAGS = new Set(["listItem"]);
const TABLE_TAGS = new Set(["tableRow"]);
const VOID = new Set(["input", "textarea"]);
const WIDE = new Set(["alert", "banner", "toast", "callout", "tooltip", "card", "panel", "input", "select", "textarea", "progressBar", "meter", "menuItem", "navItem"]);

const GalleryItem = ({ family, k }: { family: string; k: string }) => {
  if (VOID.has(family)) return <N s={family} v={k} aria-label={k} defaultValue={k} />;
  if (family === "select")
    return (
      <N s={family} v={k} aria-label={k} defaultValue={k}>
        <option>{k}</option>
      </N>
    );
  if (TABLE_TAGS.has(family))
    return (
      <N s={family} v={k}>
        <td>{k}</td>
      </N>
    );
  return (
    <N s={family} v={k} {...(family === "link" || family === "navItem" ? { href: "#" } : {})}>
      {family === "statusDot" || family === "spinner" || family === "checkbox" || family === "radio" || family === "switchControl" || family === "slider" || family === "progressBar" || family === "meter"
        ? null
        : k}
    </N>
  );
};

const Gallery = () => (
  <N s="gallery">
    {Object.entries(RECIPE_KEYS).map(([family, keys]) => {
      const items = keys.map((k) => <GalleryItem key={k} family={family} k={k} />);
      return (
        <N key={family} s="galleryGroup">
          <N s="galleryTitle">{family}</N>
          {TABLE_TAGS.has(family) ? (
            <N s="table">
              <tbody>{items}</tbody>
            </N>
          ) : LIST_TAGS.has(family) ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>{items}</ul>
          ) : (
            <N s={WIDE.has(family) ? "galleryWide" : "galleryGrid"}>{items}</N>
          )}
        </N>
      );
    })}
  </N>
);

export const App = () => (
  <N s="appRoot">
    <N s="shell">
      <Sidebar />
      <N s="main">
        <Topbar />
        <N s="content">
          <N s="section">
            <N s="pageTitle">Release 4.2</N>
            <N s="pageSubtitle">Everything that ships in the next cycle.</N>
            <Stats />
          </N>
          <N s="section">
            <Toolbar />
            <Tabs />
            <N s="cardGrid">
              {Array.from({ length: __BENCH_CARDS__ }, (_, i) => (
                <Card key={i} index={i} />
              ))}
            </N>
          </N>
          <N s="split">
            <N s="section">
              <N s="sectionTitle">Recent</N>
              <Table />
            </N>
            <N s="section">
              <N s="sectionTitle">Notices</N>
              <Feedback />
            </N>
          </N>
          <N s="split">
            <N s="section">
              <N s="sectionTitle">New issue</N>
              <Form />
            </N>
            <N s="section">
              <N s="sectionTitle">Dialog</N>
              <DialogPreview />
              <N s="panel" v="accentSoftSm">
                <N s="body">Probe</N>
                <N s="button" v="accentSolidMd" data-bench="probe">
                  Probe
                </N>
              </N>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {["Assigned to me", "Created by me", "Subscribed"].map((label, i) => (
                  <N key={label} s="listItem" v={i === 0 ? "accentSoftSm" : "neutralPlainSm"}>
                    {label}
                  </N>
                ))}
              </ul>
              <N s="tooltip" v="neutralSolidSm">
                Tooltip
              </N>
            </N>
          </N>
          <N s="section">
            <N s="sectionTitle">Every variant</N>
            <Gallery />
          </N>
        </N>
      </N>
    </N>
  </N>
);
