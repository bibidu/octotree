// When Github page loads at repo path e.g. https://github.com/jquery/jquery, the HTML tree has
// <main id="js-repo-pjax-container"> to contain server-rendered HTML in response of pjax.
// However, that <main> element doesn't have "id" attribute if the Github page loads at specific
// File e.g. https://github.com/jquery/jquery/blob/master/.editorconfig.
// Therefore, the below selector uses many path but only points to the same <main> element
const GH_PJAX_CONTAINER_SEL = 'xzzs'

const GH_CONTAINERS = '.container, .container-lg, .container-responsive'
const GH_MAX_HUGE_REPOS_SIZE = 50
const GH_HIDDEN_RESPONSIVE_CLASS = '.d-none'
const GH_RESPONSIVE_BREAKPOINT = 1010

class MT extends PjaxAdapter {
  constructor() {
    super(GH_PJAX_CONTAINER_SEL)
  }

  // @override
  init($sidebar) {
    super.init($sidebar)

    // Fix #151 by detecting when page layout is updated.
    // In this case, split-diff page has a wider layout, so need to recompute margin.
    // Note that couldn't do this in response to URL change, since new DOM via pjax might not be ready.
    const diffModeObserver = new window.MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (
          ~mutation.oldValue.indexOf('split-diff') ||
          ~mutation.target.className.indexOf('split-diff')
        ) {
          return $(document).trigger(EVENT.LAYOUT_CHANGE)
        }
      })
    })

    diffModeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    })
  }

  // @override
  getCssClass() {
    return 'octotree-github-sidebar'
  }

  // @override
  async shouldLoadEntireTree(repo) {
    const isLoadingPr = (await extStore.get(STORE.PR)) && repo.pullNumber
    if (isLoadingPr) {
      return true
    }

    const isGlobalLazyLoad = await extStore.get(STORE.LAZYLOAD)
    if (isGlobalLazyLoad) {
      return false
    }

    // Else, return true only if it isn't in a huge repo list, which we must lazy load
    const key = `${repo.username}/${repo.reponame}`
    const hugeRepos = await extStore.get(STORE.HUGE_REPOS)
    if (hugeRepos[key] && isValidTimeStamp(hugeRepos[key])) {
      // Update the last load time of the repo
      hugeRepos[key] = new Date().getTime()
      await extStore.set(STORE.HUGE_REPOS, hugeRepos)
    }
    return !hugeRepos[key]
  }

  // @override
  getCreateTokenUrl() {
    return (
      `${location.protocol}//${location.host}/settings/tokens/new?` +
      'scopes=repo&description=Octotree%20browser%20extension'
    )
  }

  // @override
  updateLayout(sidebarPinned, sidebarVisible, sidebarWidth) {
    const SPACING = 20
    const $containers =
      $('html').width() <= GH_RESPONSIVE_BREAKPOINT
        ? $(GH_CONTAINERS).not(GH_HIDDEN_RESPONSIVE_CLASS)
        : $(GH_CONTAINERS)

    const shouldPushEverything = sidebarPinned && sidebarVisible

    if (shouldPushEverything) {
      $('html').css('margin-left', sidebarWidth)

      const autoMarginLeft = ($(document).width() - $containers.width()) / 2
      const marginLeft = Math.max(SPACING, autoMarginLeft - sidebarWidth)
      $containers.each(function () {
        const $container = $(this)
        const paddingLeft = ($container.innerWidth() - $container.width()) / 2
        $container.css('margin-left', marginLeft - paddingLeft)
      })
    } else {
      $('html').css('margin-left', '')
      $containers.css('margin-left', '')
    }
  }

  resolveLocation() {
    // deal with 'scope' and 'reponame'.
    const repoExecs = /\/code\/repo-detail\/([a-z_-\w]+)\/([a-z_-\w]+)/.exec(
      location.pathname
    )
    const scope = repoExecs.length ? repoExecs[1] : ''
    const reponame = repoExecs.length ? repoExecs[2] : ''
    let branch, filepaths, paths

    // deal with branch, filepaths, paths.
    const search = location.search
    if (!search) {
      branch = 'refs/heads/master'
      filepaths = ''
      paths = []
    } else {
      const instance = new URLSearchParams(search)
      branch = instance.get('branch')
      filepaths = instance.get('path')
      paths = (instance.get('path') || '').split('/')
    }

    return { scope, reponame, branch, filepaths, paths }
  }

  // @override
  async getRepoFromPath(currentRepo, token, cb) {
    const { scope, reponame, branch } = this.resolveLocation()
    const repo = {
      username: scope,
      branch,
      scope,
      reponame,
      displayBranch: (branch || 'master').replace(/^refs\/heads\//, ''),
    }

    return cb(null, repo)
  }

  // @override
  loadCodeTree(opts, cb) {
    opts.encodedBranch = opts.repo.branch
    opts.path = '/'
    this._loadCodeTreeInternal(opts, null, cb)
  }

  get isOnPRPage() {
    const match = window.location.pathname.match(
      /([^\/]+)\/([^\/]+)(?:\/([^\/]+))?(?:\/([^\/]+))?/
    )

    if (!match) return false

    const type = match[3]

    return type === 'pull'
  }

  requestFiles({ scope, project, branch }) {
    const api = `https://dev.sankuai.com/rest/api/latest/projects/${scope}/repos/${project}/files?branch=${branch}&start=0&limit=30000`
    return fetch(api, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'cache-control': 'no-cache',
        'devtools-host': 'dev.sankuai.com',
        'm-appkey': 'fe_devtools-code-fe',
        'm-traceid': '9002150058000272341',
        pragma: 'no-cache',
        'sec-ch-ua':
          '" Not A;Brand";v="99", "Chromium";v="100", "Microsoft Edge";v="100"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'stash-area': 'mcode',
        'web-type': 'devtools',
        'x-requested-with': 'XMLHttpRequest',
      },
      referrer:
        'https://dev.sankuai.com/code/repo-detail/waimai-f2e/waimai_bargain_mp/file/list',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: null,
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
    }).then(rs => rs.json())
  }

  getIcon(type, extension) {
    if (type === 'DIRECTORY') {
      return 'tree'
    }
    const extentionMaps = {
      js: 'blob js-icon medium-yellow',
      ts: 'blob ts-icon medium-blue',
      txt: 'blob text-icon medium-blue',
      conf: 'blob config-icon medium-yellow',
      sh: 'blob terminal-icon medium-purple',
      LICENSE: 'blob book-icon medium-blue',
      json: 'blob database-icon medium-yellow',
    }

    return extentionMaps[extension] || `blob ${extension}-icon medium-yellow`
  }

  getCurrentPath(path) {
    const instance = new URLSearchParams(location.search)
    return instance.get('path')
  }

  getItemHref(repo, type, encodedPath, encodedBranch) {
    return `https://dev.sankuai.com/rest/api/2.0/projects/${repo.scope}/repos/${repo.reponame}/browse/${encodedPath}?start=0&limit=5000`
  }

  selectFile(href) {
    const codeAreaSelector = '.file-view-table' // code.
    const loadingHost = document.body // The host of loading.

    const createLoading = selector => {
      const host =
        typeof selector === 'string'
          ? document.querySelector(selector)
          : selector
      if (!host) return
      const loadingSVG =
        '<svg viewBox="0 0 20 20" class="mtd-loading-circle" style="width: 20px; height: 20px;"><circle cx="10" cy="10" r="9" fill="none" stroke-linecap="round" stroke-width="2" stroke="currentColor" style="stroke-dasharray: 39.5841, 56.5487; stroke-dashoffset: -16.9646; transition-duration: 700ms;"></circle></svg>'
      const { width, height, top, left } = host.getBoundingClientRect()

      const loading = document.body.appendChild(document.createElement('div'))

      loading.style.position = 'fixed'
      loading.style.zIndex = 9999999
      loading.style.background = 'rgba(255,255,255, 0.5)'
      loading.style.top = top + 'px'
      loading.style.left = left + 'px'
      loading.style.width = width + 'px'
      loading.style.height = height + 'px'
      loading.style.display = 'flex'
      loading.style.alignItems = 'center'
      loading.style.justifyContent = 'center'

      loading.innerHTML = loadingSVG

      return () => loading.parentNode && loading.parentNode.removeChild(loading)
    }
    const destroyLoading = createLoading(loadingHost)

    console.log('fetch', href)

    return fetch(href)
      .then(rs => rs.json())
      .then(rs => {
        // 1. deal with url.
        const origin = location.origin
        const newPathname = location.pathname.replace(/\/list$/, '/detail')

        const newPath = new URL(href).pathname.split('browse/').pop()

        const usp = new URLSearchParams(location.search)
        usp.set('path', newPath)
        if (!usp.get('branch')) {
          usp.set('branch', this.resolveLocation().branch)
        }

        const newSearch = `?${usp.toString()}`.replace(/^\?\?/, '?')
        const newURL = `${origin}${newPathname}${newSearch}`
        history.replaceState(null, '', newURL)

        // 2. deal with api.
        const { scope, reponame, branch, paths, filepaths } =
          this.resolveLocation()
        const params = { reponame, scope, branch, paths, filepaths }
        const replacementSelector = 'section.global-wrapper'
        let newContent = ''

        const isBinary = Boolean(rs.binary)
        if (isBinary) {
          newContent = this.getBinaryNewContent(params)
        } else {
          newContent = this.getNormalNewContent({
            ...params,
            codes: rs.lines.map(line => line.text),
          })
        }
        const replacement = document.querySelector(replacementSelector)
        replacement.outerHTML = newContent
      })
      .then(() => {
        destroyLoading && destroyLoading()
      })
      .catch(error => {
        destroyLoading && destroyLoading()
      })
  }

  // @override
  _getTree(path, opts, cb) {
    this.requestFiles({
      scope: opts.repo.scope,
      project: opts.repo.reponame,
      branch: opts.repo.encodedBranch,
    }).then(res => {
      const files = res.result.values

      const tree = []
      // 1. / 分割文件路径中的文件夹
      const directories = new Set()
      for (const fullName of files) {
        if (!fullName.includes('/')) continue
        let current = fullName
        while ((current = current.slice(0, current.lastIndexOf('/')))) {
          directories.add(current)
          if (!current.includes('/')) {
            break
          }
        }
      }
      // 2. 创建文件夹
      for (const dir of [...directories]) {
        tree.push(this.createStandardTree(dir, 'tree', 'DIRECTORY'))
      }
      // 3. 添加文件到文件夹
      for (const fullName of files) {
        tree.push(this.createStandardTree(fullName, 'blob', '~'))
      }

      cb(null, this.sortTree(tree))
    })
  }

  createStandardTree(fullName, type, iconType) {
    const extension = fullName.slice(fullName.lastIndexOf('.') + 1)
    return {
      text: fullName.slice(fullName.lastIndexOf('/') + 1),
      path: fullName,
      id: 'xzzs' + fullName,
      li_attr: {
        title: fullName,
      },
      icon: this.getIcon(iconType, extension),
      type: type,
    }
  }

  sortTree(tree) {
    const compare1 = (a, b) => {
      if (a.path.charAt(0) !== '.' && b.path.charAt(0) === '.') {
        return 1
      }
      return -1
    }
    const compare2 = (a, b) => {
      if (b.path.length > a.path.length) {
        return 1
      }
      return -1
    }
    const compare3 = (a, b) => {
      if (a.path.charAt(0) > b.path.charAt(0)) {
        return 1
      }
      return -1
    }

    const sortTree = tree.sort(compare1).sort(compare2).sort(compare3)
    return sortTree
  }
  /**
   * Get files that were patched in Pull Request.
   * The diff map that is returned contains changed files, as well as the parents of the changed files.
   * This allows the tree to be filtered for only folders that contain files with diffs.
   * @param {Object} opts: {
   *                  path: the starting path to load the tree,
   *                  repo: the current repository,
   *                  node (optional): the selected node (null to load entire tree),
   *                  token (optional): the personal access token
   *                 }
   * @param {Function} cb(err: error, diffMap: Object)
   */
  _getPatch(opts, cb) {
    const { pullNumber } = opts.repo

    this._get(`/pulls/${pullNumber}/files?per_page=300`, opts, (err, res) => {
      if (err) cb(err)
      else {
        const diffMap = {}

        res.forEach((file, index) => {
          // Record file patch info
          diffMap[file.filename] = {
            type: 'blob',
            diffId: index,
            action: file.status,
            additions: file.additions,
            blob_url: file.blob_url,
            deletions: file.deletions,
            filename: file.filename,
            path: file.path,
            sha: file.sha,
          }

          // Record ancestor folders
          const folderPath = file.filename.split('/').slice(0, -1).join('/')
          const split = folderPath.split('/')

          // Aggregate metadata for ancestor folders
          split.reduce((path, curr) => {
            if (path.length) path = `${path}/${curr}`
            else path = `${curr}`

            if (diffMap[path] == null) {
              diffMap[path] = {
                type: 'tree',
                filename: path,
                filesChanged: 1,
                additions: file.additions,
                deletions: file.deletions,
              }
            } else {
              diffMap[path].additions += file.additions
              diffMap[path].deletions += file.deletions
              diffMap[path].filesChanged++
            }
            return path
          }, '')
        })

        // Transform to emulate response from get `tree`
        const tree = Object.keys(diffMap).map(fileName => {
          const patch = diffMap[fileName]
          return {
            patch,
            path: fileName,
            sha: patch.sha,
            type: patch.type,
            url: patch.blob_url,
          }
        })

        // Sort by path, needs to be alphabetical order (so parent folders come before children)
        // Note: this is still part of the above transform to mimic the behavior of get tree
        tree.sort((a, b) => a.path.localeCompare(b.path))

        cb(null, tree)
      }
    })
  }

  // @override
  _getSubmodules(tree, opts, cb) {
    const item = tree.filter(item => /^\.gitmodules$/i.test(item.path))[0]
    if (!item) return cb()

    this._get(`/git/blobs/${item.sha}`, opts, (err, res) => {
      if (err) return cb(err)
      const data = atob(res.content.replace(/\n/g, ''))
      cb(null, parseGitmodules(data))
    })
  }

  _get(path, opts, cb) {
    let url

    if (path && path.startsWith('http')) {
      url = path
    } else {
      const host =
        location.protocol +
        '//' +
        (location.host === 'github.com'
          ? 'api.github.com'
          : location.host + '/api/v3')
      url = `${host}/repos/${opts.repo.username}/${opts.repo.reponame}${
        path || ''
      }`
    }

    const cfg = { url, method: 'GET', cache: false }

    if (opts.token) {
      cfg.headers = { Authorization: 'token ' + opts.token }
    }

    $.ajax(cfg)
      .done((data, textStatus, jqXHR) => {
        ;(async () => {
          if (path && path.indexOf('/git/trees') === 0 && data.truncated) {
            try {
              const hugeRepos = await extStore.get(STORE.HUGE_REPOS)
              const repo = `${opts.repo.username}/${opts.repo.reponame}`
              const repos = Object.keys(hugeRepos).filter(hugeRepoKey =>
                isValidTimeStamp(hugeRepos[hugeRepoKey])
              )
              if (!hugeRepos[repo]) {
                // If there are too many repos memoized, delete the oldest one
                if (repos.length >= GH_MAX_HUGE_REPOS_SIZE) {
                  const oldestRepo = repos.reduce((min, p) =>
                    hugeRepos[p] < hugeRepos[min] ? p : min
                  )
                  delete hugeRepos[oldestRepo]
                }
                hugeRepos[repo] = new Date().getTime()
                await extStore.set(STORE.HUGE_REPOS, hugeRepos)
              }
            } catch (ignored) {
            } finally {
              await this._handleError(cfg, { status: 206 }, cb)
            }
          } else {
            cb(null, data, jqXHR)
          }
        })()
      })
      .fail(jqXHR => this._handleError(cfg, jqXHR, cb))
  }

  getBinaryNewContent({ reponame, scope, branch, paths, filepaths }) {
    const creator = this.createContentCreator({
      reponame,
      scope,
      branch,
      paths,
      filepaths,
    })
    return creator(`<div class="is-binary">
      抱歉，新平台暂时不支持二进制文件的查看
    </div>`)
  }

  getNormalNewContent({ reponame, scope, branch, paths, filepaths, codes }) {
    const creator = this.createContentCreator({
      reponame,
      scope,
      branch,
      paths,
      filepaths,
    })
    return creator(
      codes.reduce(
        (result, code, index) =>
          result +
          `
          <div class="file-view-table">
            <div class="content">
              <a id="L${index + 1}" href="##L${
            index + 1
          }" class="line-number" style="--content: '${index + 1}'"></a>
              <pre class="line-content">${code
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\s/g, '&nbsp;')}</pre>
            </div>
          </div>
          `,
        ''
      )
    )
  }

  createContentCreator({ reponame, scope, branch, paths, filepaths }) {
    return content => `<section class="global-wrapper">
    <div class="page-content" style="height: 100%;overflow: auto;padding: 16px 24px;position: relative;">
      <div>
        <div class="repo-detail-wrapper">
          <div class="repo-detail-base-info">
            <div class="mtd-breadcrumb mtd-breadcrumb-large">
              <span class="mtd-breadcrumb-item"
                ><span class="mtd-breadcrumb-inner">${scope}</span
                ><span class="mtd-breadcrumb-separator">/</span></span
              ><span
                class="repo-name-link mtd-breadcrumb-item"
                style="position: relative; top: -2px"
                ><a
                  href="/code/repo-detail/${scope}/${reponame}/file/list"
                  class="mtd-breadcrumb-inner"
                  >${reponame}</a
                ><span class="mtd-breadcrumb-separator">/</span></span
              >
            </div>
            <div class="btn-box">
              <button type="button" class="mtd-btn mtd-btn-primary">
                <span
                  ><div class="mtd-button-content">
                    <span class="mtdicon mtdicon-file-add-o"></span
                    ><span>New pull request</span>
                  </div></span
                ></button
              ><button
                type="button"
                class="mtd-btn mtd-btn-primary mtd-btn-ghost"
              >
                <span
                  ><div class="mtd-button-content">
                    <span class="mtdicon mtdicon-file-add-o"></span
                    ><span>New branch</span>
                  </div></span
                ></button
              ><span class="mtd-tooltip-rel"
                ><button type="button" class="mtd-btn">
                  <span
                    ><div class="mtd-button-content">
                      <span class="mtdicon mtdicon-copy-o"></span
                      ><span>Clone</span>
                    </div></span
                  >
                </button></span
              ><button type="button" class="mtd-btn">
                <span
                  ><div class="mtd-button-content">
                    <span class="mtdicon mtdicon-file-add-o"></span
                    ><span>Fork</span>
                  </div></span
                ></button
              ><button type="button" class="star-btn mtd-btn">
                <span
                  ><div class="mtd-button-content">
                    <span class="mtdicon mtdicon-star-o"></span><span>收藏</span>
                  </div></span
                >
              </button>
            </div>
          </div>
          <div></div>
  
          <div class="repo-detail-tabs-box">
            <div class="header-tabs-content">
              <div class="mtd-tabs mtd-tabs-nocard mtd-tabs-large">
                <div class="mtd-tabs-nav top">
                  <div class="mtd-tabs-nav-container">
                    <div class="mtd-tabs-nav-scroll" style="max-width: 100%">
                      <div class="mtd-tabs-nav-animated">
                        <div
                          class="mtd-tabs-bar mtd-tabs-bar-active"
                          style="width: 46px; transform: translateX(0px)"
                        ></div>
                        <div
                          class="mtd-tabs-item mtd-tabs-item-large mtd-tab-active"
                        >
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/file?branch=${branch}"
                              class="tab-link router-link-active"
                              ><div class="tab-link-content">
                                <i class="tab-icon iconfont devtools-file"></i
                                ><span>文件</span>
                              </div></a
                            >
                          </div>
                        </div>
                        <div class="mtd-tabs-item mtd-tabs-item-large">
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/commit?branch=${branch}"
                              class="tab-link"
                              ><div class="tab-link-content">
                                <i class="tab-icon iconfont devtools-commits"></i
                                ><span>Commits</span>
                              </div></a
                            >
                          </div>
                        </div>
                        <div class="mtd-tabs-item mtd-tabs-item-large">
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/branch?branch=${branch}"
                              class="tab-link"
                              ><div class="tab-link-content">
                                <i class="tab-icon iconfont devtools-branches"></i
                                ><span>Branches</span>
                              </div></a
                            >
                          </div>
                        </div>
                        <div class="mtd-tabs-item mtd-tabs-item-large">
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/pr/list"
                              class="tab-link"
                              ><div class="tab-link-content">
                                <i
                                  class="tab-icon iconfont devtools-pullrequests"
                                ></i
                                ><span>Pull requests</span>
                              </div></a
                            >
                          </div>
                        </div>
                        <div class="mtd-tabs-item mtd-tabs-item-large">
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/lightmerge"
                              class="tab-link"
                              ><div class="tab-link-content">
                                <i
                                  class="tab-icon iconfont devtools-paperplane"
                                ></i
                                ><span>Light Merge</span>
                              </div></a
                            >
                          </div>
                        </div>
                        <div class="mtd-tabs-item mtd-tabs-item-large">
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/event"
                              class="tab-link"
                              ><div class="tab-link-content">
                                <i
                                  class="tab-icon iconfont devtools-calendar-o"
                                ></i
                                ><span>事件</span>
                              </div></a
                            >
                          </div>
                        </div>
                        <div class="mtd-tabs-item mtd-tabs-item-large">
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/security"
                              class="tab-link"
                              ><div class="tab-link-content">
                                <i
                                  class="tab-icon mtdicon mtdicon-shield-success"
                                ></i
                                ><span>安全</span>
                              </div></a
                            >
                          </div>
                        </div>
                        <div class="mtd-tabs-item mtd-tabs-item-large">
                          <div class="mtd-tabs-item-label">
                            <a
                              href="/code/repo-detail/${scope}/${reponame}/setting"
                              class="tab-link"
                              ><div class="tab-link-content">
                                <i class="tab-icon iconfont devtools-setting"></i
                                ><span>设置</span>
                              </div></a
                            >
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="mtd-tabs-bottom-border"></div>
                </div>
              </div>
              <div class="split-line"></div>
              <span class="mtd-popover-rel"
                ><span class="go-to-plus"
                  >前往发布<i class="mtdicon mtdicon-share-2"></i></span
              ></span>
            </div>
            <div class="header-tabs-bottom-border"></div>
          </div>
          <div class="repo-detail-content">
            <div class="repository-files-wrapper">
              <div class="repository-files-header">
                <div class="branch-select-and-path-container">
                  <div class="branch-search-wrapper" style="box-sizing: border-box;height: 32px;line-height: 30px;border: 1px solid rgba(0,0,0,.12);border-radius: 5px;display: flex;align-items: center;">
                    <div
                      class="picker mtd-dropdown mtd-picker mtd-picker-selected"
                      style="width: 200px"
                    >
                      <div class="mtd-picker-selection">
                        <div class="mtd-picker-rendered">
                          <span class="mtd-picker-values"
                            ><div class="selected-container" style="display: flex;padding-left: 10px;font-weight: normal;">
                              <i class="iconfont devtools-branches"></i
                              ><span class="selected-display-text" style="margin-left: 4px;">${branch.replace(/^refs\/heads\//, '')}</span
                              >
                            </div></span
                          >
                        </div>
                        <span class="mtd-picker-icon"
                          ><i class="mtdicon mtdicon-down-thick"></i
                        ></span>
                      </div>
                    </div>
                    <div class="append branch-icon-append" style="height: 100%;display: inline-block;padding: 0 10px;border-left: 1px solid rgba(0,0,0,.12);">
                      <span class="mtd-tooltip-rel" style="display: inline-block;vertical-align: middle;">
                        <i class="iconfont devtools-fuzhi"></i>
                      </span>
                      <span class="mtd-tooltip-rel" style="display: inline-block;border-left: 1px solid rgba(0,0,0,.12);padding-left: 8px;">
                        <i class="mtdicon mtdicon-download-o">
                      </i>
                      </span>
                    </div>
                  </div>
                  <div class="page-path">
                    <a
                      href="/code/repo-detail/${scope}/${reponame}/file/list?branch=${branch}"
                      class="route-bread-crumb page-path-name"
                    >${reponame} </a>
                    ${paths.reduce(
                      (codes, path) =>
                        codes +
                        '<span class="route-bread-crumb"><span class="split-oblique-line" style="margin:0 2px;">/</span><span class="page-path-name"></span>' +
                        path +
                        '</span></span>',
                      ''
                    )}
                  </div>
                </div>
              </div>
              <div
                class="repository-files-detail-wrapper"
                searchkey=""
                fileparam="[object Object]"
              >
                <div class="last-commit-card" style="display:none;">
                  <div class="commit-author-and-id">
                    <div class="commit-author">
                      <div class="user-head-img commit-author-head">
                        <span class="mtd-tooltip-rel"
                          ><img
                            src="https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile8/a54e5405-6bea-470d-a2c3-f445b619a60a"
                            class=""
                            onerror='this.src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIAAgMAAACJFjxpAAAADFBMVEXFxcX////p6enW1tbAmiBwAAAFiElEQVR4AezAgQAAAACAoP2pF6kAAAAAAAAAAAAAAIDbu2MkvY0jiuMWWQoUmI50BB+BgRTpCAz4G6C8CJDrC3AEXGKPoMTlYA/gAJfwETawI8cuBs5Nk2KtvfiLW+gLfK9m+r3X82G653+JP/zjF8afP1S//y+An4/i51//AsB4aH+/QPD6EQAY/zwZwN8BAP50bh786KP4+VT+3fs4/noigEc+jnHeJrzxX+NWMDDh4g8+EXcnLcC9T8U5S/CdT8bcUeBEIrwBOiI8ki7Ba5+NrePgWUy89/nYyxQ8Iw3f+pWY4h1gb3eAW7sDTPEOsLc7wK1TIeDuDB+I/OA1QOUHv/dFsZQkhKkh4QlEfOULYz2nGj2/Nn1LmwR/86VxlCoAW6kCsHRGANx1RgCMo5Qh2EsZgrXNQZZShp5Liv7Il8eIc5C91EHY2hxk6bwYmNscZIReDBwtCdhbErC1JGBpScBcOgFMLQsZMQs5Whayd+UQsLYsZGlZyNyykKllISNmIUfAwifw8NXvTojAjGFrdYi11SGWVoeYWx1i6lmQCiEjFkKOVgjZ+xxIhZCtFULWHkCqxCw9gNQKmP9vNHzipdEPrRcxtVbAeDkAvve0iM2QozVD9hfjhp4YP/UrkJYDbD2AtBxgfSkAvvHEeNcDSAsilgtAWxIy91J8AXgZAJ5e33+4tuACcAG4AFwALgBXRXQB6AFcB5MXAuA6nl9/0Vx/011/1V5/1/dfTPJvRtdnu/zL6beeFO/7r+fXBYbrEkt/j+i6ytXfpuvvE/ZXOnsA/a3a/l5xf7O6v1t+Xe/vOyz6HpO8yyboM8o7rfJes77bru83THk48p7TvOs27zvOO6/73vO++z7l4cgnMPQzKPopHC0N9noSSz6LJp/Gk88jyicy5TOp6qlc+VyyfDJbPpuuns6XzyfMJzTmMyrrKZ35nNJ8Ums+q7af1tvPK+4nNodEnPKp3fnc8npyez67/qVP7+/fL8hfcMjfsOhf8cjfMclfcnn9+BkOnLECP8Q58OYeyJ40eoyF6Ee/En/JHlP6mIlRVXprF4BxtAvArV0AxtEuALd2ARhHuwDc2gVgHPX/hFv9fMBddjIGeKg/WCxlCsI46u+Ga5mCcJd+sIG9UkGAW32ZbApFAHhod4Bb3eo04h3god0BbiUHYApVCNjbHeBW+QDAXT4a7qg7r7e214057vg0QhkEHkoSwq0kIdydXw4/Q3H8hjYJ3vL0WConBJhCHQaOToeBrU0BljYFmEoVgHGUKgAPnREAt84IgLuqFgAYSUEOAHszDwuAtSkHAZhLGYIpdCLgKGUIHtocZG1zkLmUIRhxDnJU1RDA1uYga5uDzKUOwhTnIEfnxcDe5iBrcyQAYGlzkKkUYhhxDrKXQgxbSwLWUohhbknA1JKAEZOAvSUBW0sC1pYEzC0JmFoSMMJyCDhaFrK3JGDtyiFgaVnI3LKQqWUhI2YhR8tC9paFrC0LWVoWMrcsZGpZyIhZyNGykL2rSIGtlQHWVgZYWhlgbmWAqZUBRiwDHK0MsLcywNbKAGsOoNUhllaHmFsdYmp1iBHrEEerQ+w5gFYI2VodYm11iKXVIeYcQCuETK0QMmIh5MgBtELI3gohWyuErDmAVolZWiFkzgG0SszUKjGjfj6gVmKOVonZcwCtFbB9HQC+ozWDbz1bvGu9iKW1AuYcQOtFTLEX1GbIaFegN0OOHEBrhuw5gNYM2XIArRuz5gDacoB3bTnAEktxXQ4wfw0AvveM8b4tiJjSJOwLIsbXsAKeNeKCiOO3D+AVbUl0AfjGs8ZPbUnIdgFoa1LWC0BblfMuB9AeC1j6gqQE0J9LmC8AOYD2ZMb7i4bt2ZTpWoHfPoB7Tj2fXzT8N1X41vkq/QHOAAAAAElFTkSuQmCC"'
                          />
                        </span>
                      </div>
                      <span class="mtd-tooltip-rel"
                        ><p class="commit-author-name">_</p>
                      </span>
                      <p class="commit-update-time">~</p>
                      <span class="split-line"></span
                      ><a
                        href="/code/repo-detail/${scope}/${reponame}/commit/3e4661db630348d8f34a490ac3321da9505b52d9?branch=${branch}"
                        class="commit-message-link is-link"
                        >...
                      </a>
                    </div>
                    <div class="branch-and-commit-copy">
                      <div class="mtd-dropdown" style="cursor: pointer">
                        <div class="branch-name-text">0个分支</div>
                      </div>
                      <div class="commit-copy-container commit-id">
                        <div class="commit-number">3e4661db630</div>
                        <span class="mtd-tooltip-rel"
                          ><div class="commit-copy">
                            <i class="iconfont devtools-fuzhi"></i></div></span
                        ><span class="mtd-tooltip-rel"></span>
                      </div>
                    </div>
                  </div>
                </div>
                <div filepath="" isend="true">
                  <div class="loading-page mtd-loading hidden"></div>
                  <div class="toggle-file-view-wrapper">
                    <div class="split-panel">
                      <div>
                        <span class="file-name">${filepaths}</span
                        ><span
                          class="file-name-copy mtd-tooltip-rel"
                          style="vertical-align: middle"
                          ><i class="mtdicon mtdicon-copy-o copy-icon-btn"></i
                        ></span>
                      </div>
                      <div class="operation">
                        <div class="history-select-wrapper">
                          <div class="mtd-select mtd-select-small">
                            <div>
                              <div
                                class="mtd-input-wrapper mtd-select-input mtd-input-suffix mtd-input-readonly mtd-input-small"
                              >
                                <input
                                  type="text"
                                  readonly="readonly"
                                  autocomplete="off"
                                  placeholder="History"
                                  class="mtd-input"
                                /><span class="mtd-input-suffix-inner"
                                  ><i class="mtdicon mtdicon-down-thick"></i
                                ></span>
                              </div>
                            </div>
                          </div>
                        </div>
  
                        <div class="radio-group-view-value mtd-radio-group">
                          <label
                            class="mtd-radio-button mtd-radio-button-checked mtd-radio-button-small"
                            ><span class="mtd-radio-button-inner"
                              >Source view</span
                            ></label
                          ><label
                            class="mtd-radio-button mtd-radio-button-disabled mtd-radio-button-small"
                            ><span class="mtd-radio-button-inner"
                              >Diff to previous</span
                            ></label
                          >
                        </div>
                        <button
                          type="button"
                          disabled="disabled"
                          class="mtd-btn mtd-btn-small mtd-btn-disabled"
                        >
                          <span>Blame</span></button
                        ><button type="button" class="mtd-btn mtd-btn-small">
                          <span>Raw</span>
                        </button>
                      </div>
                    </div>
                    <div class="file-view-wrapper single">
                    ${content}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
  `
  }
}
