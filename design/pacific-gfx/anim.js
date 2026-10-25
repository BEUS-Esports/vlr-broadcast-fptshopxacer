// GSAP thay cho CSS keyframes: đọc class a-* + animation-delay sẵn có, dựng timeline.
// Trang có <body data-anim="css"> thì giữ animation CSS (winner, transition).
(function () {
	const ready = () => {
		window.__ready = true;
	};
	if (document.body.dataset.anim === 'css' || !window.gsap) {
		(document.fonts ? document.fonts.ready : Promise.resolve()).then(ready);
		return;
	}
	// mọi tween nằm trên 1 master timeline: vị trí = delay → phát đúng nhịp, tua được khi quay
	const tl = gsap.timeline();
	window.__tl = tl;
	const pos = (v) => {
		const d = v.delay || 0;
		delete v.delay;
		return d;
	};
	const T = {
		from: (t, v) => tl.from(t, v, pos(v)),
		to: (t, v) => tl.to(t, v, pos(v)),
		fromTo: (t, a, b) => tl.fromTo(t, a, b, pos(b))
	};
	const delayOf = (el) => parseFloat(el.dataset.at ?? el.style.animationDelay) || 0;
	const kill = (el) => {
		if (el.dataset.at === undefined) el.dataset.at = parseFloat(el.style.animationDelay) || 0;
		el.style.animation = 'none';
	};

	// chữ/số chạy ngẫu nhiên rồi chốt dần về nội dung thật (trái → phải)
	const GLYPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@';
	const DIGIT = '0123456789';
	function scramble(el, at, dur = 1.0) {
		const final = el.textContent;
		if (!final.trim()) return;
		const o = { p: 0 };
		let last = -1;
		T.to(o, {
			p: 1,
			duration: dur,
			delay: at,
			ease: 'none',
			onComplete: () => (el.textContent = final),
			onUpdate() {
				if (o.p >= 0.75) {
					el.textContent = final;
					return;
				} // 25% cuối: đứng yên đúng giá trị
				const f = Math.floor(o.p * 30);
				if (f === last) return;
				last = f; // đổi ký tự ~30 lần/giây
				const lock = Math.floor((o.p / 0.75) * final.length);
				let out = '';
				for (let i = 0; i < final.length; i++) {
					const c = final[i];
					if (i < lock || /[^A-Za-z0-9]/.test(c)) {
						out += c;
						continue;
					} // giữ nguyên $ , . % + khoảng trắng
					const set = /\d/.test(c) ? DIGIT : GLYPH;
					out += set[(Math.random() * set.length) | 0];
				}
				el.textContent = out;
			}
		});
	}

	function splitTitle(h, at) {
		const walk = (node) =>
			[...node.childNodes].forEach((n) => {
				if (n.nodeType === 3) {
					const frag = document.createDocumentFragment();
					for (const w of n.textContent.split(/(\s+)/)) {
						if (!w) continue;
						if (/^\s+$/.test(w)) {
							frag.append(w);
							continue;
						}
						const mask = document.createElement('span');
						mask.className = 'mask';
						for (const c of w) {
							const s = document.createElement('span');
							s.className = 'ch';
							s.textContent = c;
							mask.append(s);
						}
						frag.append(mask);
					}
					n.replaceWith(frag);
				} else if (n.nodeType === 1 && !n.classList.contains('kick')) walk(n);
			});
		walk(h);
		const chs = [...h.querySelectorAll('.ch')],
			fin = chs.map((c) => c.textContent),
			o = { p: 0 };
		let last = -1;
		T.to(o, {
			p: 1,
			duration: 1.3,
			delay: at,
			ease: 'none',
			onComplete: () => chs.forEach((c, i) => (c.textContent = fin[i])),
			onUpdate() {
				const f = Math.floor(o.p * 36);
				if (f === last) return;
				last = f;
				chs.forEach((c, i) => {
					const lockAt = 0.25 + (i / chs.length) * 0.65;
					c.textContent = o.p >= lockAt ? fin[i] : GLYPH[(Math.random() * 26) | 0];
				});
			}
		});
		T.from(h.querySelectorAll('.ch'), {
			yPercent: 110,
			rotate: 4,
			duration: 1.1,
			ease: 'expo.out',
			stagger: 0.028,
			delay: at
		});
	}

	function run() {
		const all = document.querySelectorAll('[class*="a-"]');
		all.forEach(kill);
		document.querySelectorAll('.frame, .foot').forEach(kill);

		// tiêu đề: chữ trồi lên sau mặt nạ, vạch lime của nhãn kéo ra
		document
			.querySelectorAll('.h1')
			.forEach((h) => splitTitle(h, delayOf(h.closest('[class*="a-"]') || h) + 0.05));
		document.querySelectorAll('.kick').forEach((k) => {
			const at = delayOf(k.closest('[class*="a-"]') || k);
			T.from(k, { opacity: 0, x: -20, duration: 0.6, ease: 'power3.out', delay: at });
		});

		all.forEach((el) => {
			const at = delayOf(el),
				c = el.className;
			if (el.classList.contains('h1') || el.querySelector(':scope > .h1')) {
				gsap.set(el, { opacity: 1 });
				return;
			}
			const dir = /a-wipeR/.test(c)
				? 'R'
				: /a-wipeL/.test(c)
					? 'L'
					: /a-wipeU/.test(c)
						? 'U'
						: /a-wipeD/.test(c)
							? 'D'
							: null;
			if (dir) {
				const from = {
					R: 'inset(0% 100% 0% 0%)',
					L: 'inset(0% 0% 0% 100%)',
					U: 'inset(100% 0% 0% 0%)',
					D: 'inset(0% 0% 100% 0%)'
				}[dir];
				T.fromTo(
					el,
					{ clipPath: from },
					{ clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'expo.out', delay: at }
				);
				const off = { R: { x: -40 }, L: { x: 40 }, U: { y: 40 }, D: { y: -40 } }[dir];
				T.from(el, { ...off, duration: 1.1, ease: 'expo.out', delay: at });
				const img = el.querySelector('.photo-cut img, img.ag, :scope > img');
				if (img) T.from(img, { scale: 1.12, duration: 1.8, ease: 'expo.out', delay: at });
			} else if (/a-drop/.test(c))
				T.from(el, { y: -36, opacity: 0, duration: 0.7, ease: 'expo.out', delay: at });
			else if (/a-rise/.test(c))
				T.from(el, { y: 36, opacity: 0, duration: 0.7, ease: 'expo.out', delay: at });
			else if (/a-pop/.test(c))
				T.from(el, { scale: 0.82, opacity: 0, duration: 0.8, ease: 'expo.out', delay: at });
			else T.from(el, { opacity: 0, duration: 0.6, ease: 'power2.out', delay: at });
		});

		// khung: góc chữ L tự kéo ra, gạch đứt chạy dọc
		document.querySelectorAll('.frame .brk').forEach((b, i) =>
			T.from(b, {
				scale: 0,
				transformOrigin: ['0 0', '100% 0', '0 100%', '100% 100%'][i % 4],
				duration: 0.7,
				ease: 'expo.out',
				delay: 0.15 + i * 0.05
			})
		);
		document
			.querySelectorAll('.frame .dash-v')
			.forEach((d) => T.from(d, { scaleY: 0, duration: 0.9, ease: 'expo.out', delay: 0.3 }));
		T.from('.foot', { opacity: 0, y: 10, duration: 0.6, delay: 0.8, ease: 'power2.out' });

		// số chạy
		// random chỉ cho con số CHÍNH (đánh dấu .hero, hoặc tổng tiền thưởng); các số khác hiện bình thường
		document
			.querySelectorAll('.hero, .tot b')
			.forEach((el) => scramble(el, delayOf(el.closest('[class*="a-"]') || el) + 0.1, 1.1));
	}
	(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
		run();
		ready();
	});
})();
