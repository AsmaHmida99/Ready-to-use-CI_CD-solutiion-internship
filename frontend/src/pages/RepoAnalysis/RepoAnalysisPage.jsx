import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import "./RepoAnalysisPage.css";

// Headers pour les appels API authentifiés
const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("authToken")}`,
  "Content-Type": "application/json",
});

// Récupère les vrais fichiers du repository (pas de fallback)
async function fetchRepoFiles(repo) {
  if (!repo || !repo.repoId) {
    throw new Error("Repository ID not available");
  }

  const response = await fetch(
    `http://localhost:8080/api/stack-analysis/repository/${repo.repoId}/all-files`,
    { headers: getAuthHeaders() }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || "Erreur lors du chargement des fichiers");
  }
  return data.files || [];
}

/** Construit un arbre {name,type,path,children[]} à partir d'une liste de chemins */
function buildTree(paths) {
  const root = { name: "", type: "dir", path: "", children: new Map() };
  for (const p of paths) {
    if (!p) continue;
    const parts = p.split("/");
    let node = root;
    let acc = "";
    parts.forEach((part, idx) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = idx === parts.length - 1 && /\.[^./\\]+$/.test(part);
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          type: isFile ? "file" : "dir",
          path: acc,
          children: new Map(),
        });
      }
      node = node.children.get(part);
    });
  }
  const mapToArray = (n) => {
    const childrenArr = Array.from(n.children.values())
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1
      )
      .map(mapToArray);
    return { ...n, children: childrenArr };
  };
  return mapToArray(root);
}

/** Rendu récursif de l'arbre avec <details>/<summary> */
function TreeNode({ node }) {
  if (node.type === "dir") {
    return (
      <details className="tree-dir" open>
        {node.name && (
          <summary>
            <span className="tree-icon">📁</span>
            {node.name}
          </summary>
        )}
        <div className="tree-children">
          {node.children.map((c) => (
            <TreeNode key={c.path} node={c} />
          ))}
        </div>
      </details>
    );
  }
  return (
    <div className="tree-file">
      <span className="tree-icon">📄</span>
      {node.name}
    </div>
  );
}

export default function RepoAnalysisPage() {
  const location = useLocation();
  const [params] = useSearchParams();

  const repo = location.state?.repo || null;
  const repoFullName = repo?.fullName || params.get("repo") || "unknown/repo";

  // files
  const [allFiles, setAllFiles] = useState([]);
  const [visibleFiles, setVisibleFiles] = useState([]);
  const [filesError, setFilesError] = useState(null);

  // analysis modal
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState(null);

  // bouton "Continue"
  const [showContinueButton, setShowContinueButton] = useState(false);

  // charger fichiers puis les révéler un par un
  useEffect(() => {
    let interval;
    let alive = true;

    (async () => {
      try {
        setFilesError(null);
        const files = await fetchRepoFiles(repo);
        if (!alive) return;
        setAllFiles(files);

        let i = 0;
        interval = setInterval(() => {
          i++;
          setVisibleFiles(files.slice(0, i));
          if (i >= files.length) clearInterval(interval);
        }, 120);
      } catch (e) {
        if (!alive) return;
        setFilesError(e.message || "Impossible de charger les fichiers.");
      }
    })();

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [repo]);

  // construit l'arbre dynamiquement
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);

  // "analyse" simulée
  const byExt = useMemo(() => {
    const counts = {};
    for (const f of allFiles) {
      const m = f.match(/\.([a-z0-9]+)$/i);
      const ext = m ? m[1].toLowerCase() : "other";
      counts[ext] = (counts[ext] || 0) + 1;
    }
    return counts;
  }, [allFiles]);

  useEffect(() => {
    setIsAnalyzing(true);
    const t = setTimeout(() => {
      setAnalysis({ repo: repoFullName, total: allFiles.length, byExt });
      setIsAnalyzing(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [repoFullName, allFiles, byExt]);

  const onValidateGenerateCI = async () => {
    alert("CI generation triggered (stub).");
    setAnalysisOpen(false);
    setShowContinueButton(false);
  };

  const onCancel = () => {
    setAnalysisOpen(false);
    setShowContinueButton(true);
  };

  const onContinueAnalysis = () => {
    setAnalysisOpen(true);
    setShowContinueButton(false);
  };

  return (
    <div className="analysis-page">
      <div className="analysis-header">
        <h2>
          Analyzing <span>{repoFullName}</span>
        </h2>
      </div>

      {showContinueButton && !isAnalyzing && (
        <div className="continue-analysis">
          <p>
            Analysis completed! Continue to generate CI configuration for this repository.
          </p>
          <button className="continue-btn" onClick={onContinueAnalysis}>
            Continue Analysis & Generate CI
          </button>
        </div>
      )}

      <div className="file-panel">
        <h3>Repository structure</h3>

        {filesError ? (
          <div className="error">{filesError}</div>
        ) : (
          <div className="tree-root">
            {tree.children?.map((n) => (
              <TreeNode key={n.path} node={n} />
            ))}
          </div>
        )}
      </div>

      {analysisOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => !isAnalyzing && setAnalysisOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Repository analysis</h3>
            </div>
            <div className="modal-body">
              {isAnalyzing ? (
                <div className="analysis-loading">
                  <span className="spinner" /> Analyzing repository…
                </div>
              ) : (
                <>
                  <div className="summary">
                    <div>
                      <strong>Repository:</strong> {analysis.repo}
                    </div>
                    <div>
                      <strong>Total files:</strong> {analysis.total}
                    </div>
                  </div>
                  <div className="exts">
                    {Object.entries(analysis.byExt).map(([ext, n]) => (
                      <span className="ext-chip" key={ext}>
                        {ext} · {n}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onCancel} disabled={isAnalyzing}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={onValidateGenerateCI} disabled={isAnalyzing}>
                Valider & générer CI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
