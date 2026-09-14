/**
 * 工具箱登入部門選項（全站共用）
 */
(function () {
    'use strict';

    window.SKYFUN_BUSINESS_OFFICES = [
        '北一處',
        '北二處',
        '北三處',
        '基一處',
        '桃一處',
        '竹一處',
        '宜一處',
        '中一處',
        '中二處',
        '中三處',
        '中四處',
        '中五處',
        '中六處',
        '彰一處',
        '嘉一處',
        '南一處',
        '南二處',
        '高一處',
        '高二處',
    ];

    window.SKYFUN_STANDALONE_DEPARTMENTS = ['行政管理部', '總經理室', '租賃管理部', '電銷部', '客服部', '客滿部', '財務部'];

    window.SKYFUN_DEPARTMENTS = window.SKYFUN_BUSINESS_OFFICES.concat(window.SKYFUN_STANDALONE_DEPARTMENTS);

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** @param {string} [selected] */
    window.buildSkyfunDepartmentSelectHtml = function buildSkyfunDepartmentSelectHtml(selected) {
        const sel = String(selected || '').trim();
        let html = '<option value="">請選擇處別</option>';
        if (sel && !window.SKYFUN_DEPARTMENTS.includes(sel)) {
            html += `<option value="${escapeHtml(sel)}" selected>${escapeHtml(sel)}（舊）</option>`;
        }
        html += '<optgroup label="業務部">';
        window.SKYFUN_BUSINESS_OFFICES.forEach((o) => {
            html += `<option value="${escapeHtml(o)}"${o === sel ? ' selected' : ''}>${escapeHtml(o)}</option>`;
        });
        html += '</optgroup>';
        html += '<optgroup label="其他部門">';
        window.SKYFUN_STANDALONE_DEPARTMENTS.forEach((o) => {
            html += `<option value="${escapeHtml(o)}"${o === sel ? ' selected' : ''}>${escapeHtml(o)}</option>`;
        });
        html += '</optgroup>';
        return html;
    };
})();
