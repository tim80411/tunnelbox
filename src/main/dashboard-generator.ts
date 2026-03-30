import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createLogger } from './logger'

const log = createLogger('DashboardGenerator')

export interface DashboardSiteEntry {
  name: string
  url: string
  tags: string[]
}

let dashboardDir: string | null = null

export function generateDashboardHtml(sites: DashboardSiteEntry[]): string {
  const sitesJson = JSON.stringify(sites)

  if (sites.length === 0) {
    return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="utf-8"><title>TunnelBox Dashboard</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:40px;background:#f8f9fa;text-align:center;color:#666}h1{color:#333}</style>
</head><body><h1>TunnelBox Dashboard</h1><p>目前沒有正在分享的站點</p></body></html>`
  }

  return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TunnelBox Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f8f9fa;color:#333;padding:24px}
h1{font-size:1.5rem;margin-bottom:8px}
.subtitle{color:#666;margin-bottom:24px;font-size:.9rem}
.filter-bar{margin-bottom:16px;padding:8px 12px;background:#e9ecef;border-radius:8px;font-size:.85rem;color:#495057}
.sites{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.site{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);transition:box-shadow .2s}
.site:hover{box-shadow:0 4px 12px rgba(0,0,0,.15)}
.site-name{font-weight:600;font-size:1.1rem;margin-bottom:8px}
.site-url{color:#0066cc;text-decoration:none;word-break:break-all;font-size:.9rem}
.site-url:hover{text-decoration:underline}
.tags{margin-top:10px;display:flex;flex-wrap:wrap;gap:4px}
.tag{background:#e9ecef;color:#495057;padding:2px 8px;border-radius:12px;font-size:.75rem}
.empty{text-align:center;padding:40px;color:#666}
</style></head>
<body>
<h1>TunnelBox Dashboard</h1>
<p class="subtitle">Shared Sites</p>
<div id="filter-bar" class="filter-bar" style="display:none"></div>
<div id="sites" class="sites"></div>
<script>
var SITES=${sitesJson};
var params=new URLSearchParams(window.location.search);
var groupFilter=params.get('group');
var container=document.getElementById('sites');
var filterBar=document.getElementById('filter-bar');
if(groupFilter){filterBar.style.display='block';filterBar.textContent='Filtered by: '+groupFilter;}
var filtered=groupFilter?SITES.filter(function(s){return s.tags.indexOf(groupFilter)!==-1}):SITES;
if(filtered.length===0){
  container.innerHTML='<div class="empty">沒有符合條件的站點</div>';
}else{
  filtered.forEach(function(s){
    var div=document.createElement('div');div.className='site';
    var tagsHtml=s.tags.map(function(t){return '<span class="tag">'+t+'</span>'}).join('');
    div.innerHTML='<div class="site-name">'+s.name+'</div>'
      +'<a class="site-url" href="'+s.url+'" target="_blank" rel="noopener">'+s.url+'</a>'
      +(tagsHtml?'<div class="tags">'+tagsHtml+'</div>':'');
    container.appendChild(div);
  });
}
</script></body></html>`
}

export function writeDashboard(sites: DashboardSiteEntry[]): string {
  const html = generateDashboardHtml(sites)
  if (!dashboardDir) {
    dashboardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnelbox-dashboard-'))
  }
  const filePath = path.join(dashboardDir, 'index.html')
  fs.writeFileSync(filePath, html, 'utf-8')
  log.info(`Dashboard written to ${filePath}`)
  return dashboardDir
}

export function cleanupDashboard(): void {
  if (dashboardDir) {
    try { fs.rmSync(dashboardDir, { recursive: true, force: true }) } catch { /* best effort */ }
    dashboardDir = null
  }
}

export function getDashboardDir(): string | null {
  return dashboardDir
}
