/**
 * The Clipboard API exists only in secure contexts; controllers on a plain-HTTP LAN origin
 * fall back to the legacy copy command on a temporary, selected textarea.
 */
export async function copyText(text: string) {
	if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.opacity = '0';
	document.body.append(area);
	try {
		area.focus();
		area.select();
		if (!document.execCommand('copy')) throw new Error('Copy command was rejected.');
	} finally {
		area.remove();
	}
}
