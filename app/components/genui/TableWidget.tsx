'use client';

import React, { useState, useMemo } from 'react';
import { Table, Search, Copy, Check, ArrowDownWideNarrow } from 'lucide-react';

interface TableWidgetProps extends React.HTMLAttributes<HTMLTableElement> {
  children?: React.ReactNode;
}

function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(' ');
  if (node.props && node.props.children) return extractText(node.props.children);
  return '';
}

export function TableWidget({ children, ...props }: TableWidgetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Extrai thead e tbody
  const { theadNode, tbodyNode, otherNodes } = useMemo(() => {
    let thead: React.ReactNode = null;
    let tbody: React.ReactNode = null;
    const others: React.ReactNode[] = [];

    React.Children.forEach(children, (child: any) => {
      if (!child) return;
      if (child.type === 'thead') {
        thead = child;
      } else if (child.type === 'tbody') {
        tbody = child;
      } else {
        others.push(child);
      }
    });

    return { theadNode: thead, tbodyNode: tbody, otherNodes: others };
  }, [children]);

  // Extrai linhas do tbody
  const rows = useMemo(() => {
    if (!tbodyNode || !(tbodyNode as any).props) return [];
    return React.Children.toArray((tbodyNode as any).props.children);
  }, [tbodyNode]);

  // Filtra linhas pela busca
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((rowNode) => {
      const text = extractText(rowNode).toLowerCase();
      return text.includes(q);
    });
  }, [rows, searchQuery]);

  // Copia a tabela formatada em Markdown
  const handleCopyTable = () => {
    try {
      const headers: string[] = [];
      if (theadNode && (theadNode as any).props) {
        const theadChildren = (theadNode as any).props.children;
        const thList = theadChildren?.props?.children || theadChildren;
        React.Children.forEach(thList, (th) => {
          headers.push(extractText(th).trim());
        });
      }

      const rowsData: string[][] = rows.map((r) => {
        const cells: string[] = [];
        const trChildren = (r as any)?.props?.children;
        React.Children.forEach(trChildren, (td) => {
          cells.push(extractText(td).trim());
        });
        return cells;
      });

      let md = '';
      if (headers.length > 0) {
        md += `| ${headers.join(' | ')} |\n`;
        md += `| ${headers.map(() => '---').join(' | ')} |\n`;
      }
      rowsData.forEach((row) => {
        md += `| ${row.join(' | ')} |\n`;
      });

      navigator.clipboard.writeText(md.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar tabela:', err);
    }
  };

  const totalRows = rows.length;
  const shownRows = filteredRows.length;

  return (
    <div className="genui-widget table-widget-wrapper my-4">
      {/* Barra de Ferramentas da Tabela */}
      <div className="table-widget-toolbar">
        <div className="table-widget-title-area">
          <Table size={16} className="text-amber-400" />
          <span className="table-widget-label">Tabela Interativa</span>
          {totalRows > 0 && (
            <span className="table-widget-badge">
              {searchQuery ? `${shownRows} de ${totalRows} linhas` : `${totalRows} linhas`}
            </span>
          )}
        </div>

        <div className="table-widget-actions">
          {totalRows > 1 && (
            <div className="table-widget-search">
              <Search size={13} className="text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar dados..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="table-search-input"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyTable}
            className={`table-action-btn ${copied ? 'copied' : ''}`}
            title="Copiar tabela como Markdown"
          >
            {copied ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabela Scrollável */}
      <div className="table-widget-scroll-container">
        <table className="table-widget-table" {...props}>
          {theadNode}
          {tbodyNode ? (
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows
              ) : (
                <tr>
                  <td colSpan={10} className="table-empty-search">
                    Nenhum resultado encontrado para &quot;{searchQuery}&quot;
                  </td>
                </tr>
              )}
            </tbody>
          ) : (
            otherNodes
          )}
        </table>
      </div>
    </div>
  );
}
