import {
  GitBranch,
  GitCommitHorizontal,
  Layers2,
  Plus,
  ChevronDown,
  FolderGit2,
  Archive,
  Tag,
  Globe2,
  Settings2,
  Activity,
  Leaf,
} from "lucide-react";
import type { Project, Snapshot } from "../types";
import { Avatar, IconButton, Logo } from "./ui";
import { isDesktop } from "../api";
export type View =
  | "changes"
  | "history"
  | "branches"
  | "stashes"
  | "tags"
  | "remotes"
  | "activity"
  | "settings";
interface Props {
  projects: Project[];
  project: Project | null;
  snapshot: Snapshot | null;
  view: View;
  setView: (view: View) => void;
  selectProject: (project: Project) => void;
  onOpen: () => void;
  onAdd: () => void;
}
export default function Sidebar({
  projects,
  project,
  snapshot,
  view,
  setView,
  selectProject,
  onOpen,
  onAdd,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        <span>
          grove<span className="brand-period">.</span>
        </span>
      </div>
      <div className="sidebar-content">
        <div className="section-heading">
          <span>WORKSPACE</span>
          <IconButton label="Add repository" onClick={onAdd}>
            <Plus size={15} />
          </IconButton>
        </div>
        <nav aria-label="Repositories" className="projects">
          {projects.map((p, i) => (
            <button
              key={p.path}
              className={`project-link ${project?.path === p.path ? "active" : ""}`}
              onClick={() => selectProject(p)}
            >
              <span className={`project-symbol project-symbol-${i % 3}`}>
                <FolderGit2 size={17} />
              </span>
              <span>{p.name}</span>
              {project?.path === p.path && <span className="online-dot" />}
            </button>
          ))}
          <button className="add-project" onClick={onOpen}>
            <Plus size={15} />
            Open repository<span>⌘O</span>
          </button>
        </nav>
        <div className="sidebar-rule" />
        <nav aria-label="Repository views" className="main-nav">
          <button
            disabled={!project}
            className={view === "changes" ? "selected" : ""}
            onClick={() => setView("changes")}
          >
            <Layers2 size={17} />
            <span>Changes</span>
            {!!snapshot?.files.length && (
              <span className="nav-count">{snapshot.files.length}</span>
            )}
          </button>
          <button
            disabled={!project}
            className={view === "history" ? "selected" : ""}
            onClick={() => setView("history")}
          >
            <GitCommitHorizontal size={18} />
            <span>History</span>
          </button>
        </nav>
        <details className="git-tools">
          <summary>
            <Settings2 size={15} />
            <span>
              {["branches", "stashes", "tags", "remotes", "activity"].includes(
                view,
              )
                ? `Git tools · ${view === "activity" ? "Activity" : view.charAt(0).toUpperCase() + view.slice(1)}`
                : "Git tools"}
            </span>
            <ChevronDown size={13} />
          </summary>
          <nav className="secondary-nav" aria-label="Git tools">
            {(
              [
                { id: "branches", icon: GitBranch, label: "Branches" },
                { id: "stashes", icon: Archive, label: "Stashes" },
                { id: "tags", icon: Tag, label: "Tags" },
                { id: "remotes", icon: Globe2, label: "Remotes" },
                { id: "activity", icon: Activity, label: "Activity log" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                disabled={item.id !== "activity" && !project}
                className={view === item.id ? "selected" : ""}
                onClick={() => setView(item.id)}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </details>
      </div>
      <div className="sidebar-bottom">
        <button
          className={view === "settings" ? "selected" : ""}
          onClick={() => setView("settings")}
        >
          <Settings2 size={16} />
          Preferences
        </button>
        {!isDesktop && (
          <div className="demo-label">
            <Leaf size={13} />
            <span>Demo workspace</span>
            <span className="demo-pulse" />
          </div>
        )}
        <div className="profile">
          <Avatar name={snapshot?.user.name || "Local workspace"} />
          <div>
            <strong>{snapshot?.user.name || "Your workspace"}</strong>
            <span>
              {isDesktop
                ? "Everything stays local"
                : "Explore. Make yourself at home."}
            </span>
          </div>
          <span className="local-indicator" />
        </div>
      </div>
    </aside>
  );
}
