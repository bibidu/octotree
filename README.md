## Octotree For mt

`Octotree` 为 `GitHub` 提供侧边目录树的功能. 本项目基于 `Octotree` Fork 而来, 在支持 `GitHub` 的基础上，增加了对 `mt` 的支持.

## How to use
默认支持 `GitHub`, 如果需要在 `mt` 的页面下使用, 需要添加油猴脚本.

```javascript
(function() {
    'use strict';

    const script = document.head.appendChild(document.createElement('script'));
    script.setAttribute('class', 'custom_octotree');
    script.setAttribute('type', 'application/json');
    script.textContent = JSON.stringify({ type: 'MT' });
})();
```

