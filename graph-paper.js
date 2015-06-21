(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-41367436-1', 'auto');
ga('send', 'pageview', {'page': '/graph-paper/'});

window.applicationCache.onupdateready = function() {
	location.reload();
};

var gapi_client_load = function() {
	"use strict";

	var CLIENT_ID = '477142404112-nupku65oo2pis2ajtdqobp53ek38dofc.apps.googleusercontent.com';
	var SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.install'];
	var DEFAULT_TITLE = 'Untitled Graph Paper';
	var CURRENT_VERSION = '0';

	var realtime = new utils.RealtimeUtils({'clientId': CLIENT_ID, 'scopes': SCOPES, 'onError': function(error) {
		if (error.type == window.gapi.drive.realtime.ErrorType.TOKEN_REFRESH_REQUIRED) {
			realtime.authorizer.authorize(function() {
				console.log('Error, auth refreshed');
			}, false);
		} else if (error.type == window.gapi.drive.realtime.ErrorType.CLIENT_ERROR) {
			alert('An Error happened: ' + error.message);
			window.location.hash = '';
		} else if (error.type == window.gapi.drive.realtime.ErrorType.NOT_FOUND) {
			alert('The file was not found. It does not exist or you do not have read access to the file.');
			window.location.hash = '';
		} else if (error.type == window.gapi.drive.realtime.ErrorType.FORBIDDEN) {
			alert('You do not have access to this file. Try having the owner share it with you from Google Drive.');
			window.location.hash = '';
		}
	}});

	var view_changed = 0;
	var file_by_id_fast = null;

	function check_auth() {
		realtime.authorize(handle_auth, false);
	}

	function status(id, active) {
		document.getElementById('status-' + id).style.display = active ? 'block' : 'none';
	}

	function handle_auth(result) {
		status('init', false);
		status('need-auth', false);

		var button = document.getElementById('authorize');

		button.style.display = 'none';

		if (result && !result.error) {
			// Access token has been successfully retrieved, requests can be sent to the API.
			status('connecting', true);
			gapi.client.load('drive', 'v2', ready);
		} else {
			// No access token could be retrieved, show the button to start the authorization flow.
			status('need-auth', true);
			button.style.display = 'block';
			button.onclick = function() {
				realtime.authorize(handle_auth, true);
			};
		}
	}

	function ready() {
		status('connecting', false);

		document.getElementById('new').onclick = function() {
			new_document(open_document);
		};

		window.onresize = window_resized;
		window_resized();
		window.onhashchange = hash_changed;
		hash_changed();
	}

	var close = null;
	var repaint_ = function(ctx) {};
	var repaint_handle = null;
	var viewport = null;
	function repaint() {
		if (repaint_handle === null) {
			repaint_handle = requestAnimationFrame(function() {
				repaint_handle = null;
				if (viewport) {
					var ctx = viewport.getContext('2d');
					ctx.clearRect(-1, -1, viewport.width + 1, viewport.height + 1);
					repaint_(ctx);
				}
			});
		}
	}

	function window_resized() {
		viewport = document.getElementById('viewport');
		viewport.width = window.innerWidth;
		viewport.height = window.innerHeight - 8 - 32 - 8;
		repaint();
	}

	function hash_changed() {
		view_changed++;

		ga('send', 'pageview', {'page': '/graph-paper/' + location.hash.replace(/^#/, '')});

		document.title = 'Graph Paper';
		document.getElementById('main').style.display = 'none';
		document.getElementById('viewport-container').style.display = 'none';
		document.querySelector('html').style.overflow = 'auto';

		if (close) {
			close();
			close = null;
		}

		var view_id = view_changed;
		var matches;
		if (matches = /^#edit\/(.*)$/.exec(location.hash)) {
			document.getElementById('viewport-container').style.display = 'block';
			document.querySelector('html').style.overflow = 'hidden';
			status('retrieving-metadata', true);
			get_file_by_id(matches[1], function(file) {
				status('retrieving-metadata', false);
				if (view_changed === view_id) {
					open_document(file);
				}
			});
		} else if (location.hash === '#new') {
			new_document(function(file) {
				if (view_changed === view_id) {
					open_document(file);
				}
			});
		} else {
			document.getElementById('main').style.display = 'block';
			status('loading-file-list', true);
			get_file_list(gapi.client.drive.files.list(), []);
		}
	}

	function get_file_by_id(id, callback) {
		if (file_by_id_fast && file_by_id_fast['id'] === id) {
			var file = file_by_id_fast;
			file_by_id_fast = null;
			callback(file);
			return;
		}
		gapi.client.drive.files.get({
			'fileId': id
		}).execute(callback);
	}

	function get_file_list(request, result) {
		request.execute(function(response) {
			result = result.concat(response.items);
			var next = response['nextPageToken'];
			got_file_list(result, !next);
			if (next) {
				request = gapi.client.drive.files.list({
					'pageToken': next
				});
				get_file_list(request, result);
			}
		});
	}

	function got_file_list(files, have_all) {
		var list = document.querySelector('#file-list');
		var have = {};
		Array.prototype.forEach.call(document.querySelectorAll('#file-list .file[data-drive-id]'), function(el) {
			have[el.getAttribute('data-drive-id')] = el;
		});
		files.forEach(function(file) {
			if (have[file['id']]) {
				update_file_list_item(have[file['id']], file);
			} else {
				var el = document.createElement('tr');
				el.className = 'file';
				el.setAttribute('data-drive-id', file['id']);
				list.appendChild(el);
				update_file_list_item(el, file);
			}
			delete have[file.id];
		});
		if (have_all) {
			status('loading-file-list', false);

			// remove deleted items from list
			for (var id in have) {
				list.removeChild(have[id]);
			}
		}
	}

	function format_date(date) {
		return date.toLocaleString();
	}

	function update_file_list_item(el, file) {
		var title = el.querySelector('.title');
		if (!title) {
			title = document.createElement('td');
			title.className = 'title';
			el.appendChild(title);
		}
		title.textContent = file.title;

		var lastModified = el.querySelector('.last-modified');
		if (!lastModified) {
			lastModified = document.createElement('td');
			lastModified.className = 'last-modified';
			el.appendChild(lastModified);
		}
		lastModified.textContent = file.lastModifyingUserName + ' ' + format_date(new Date(file.modifiedDate));

		el.onclick = function() {
			open_document(file);
		};
	}

	function new_document(callback) {
		realtime.createRealtimeFile(DEFAULT_TITLE, callback);
	}

	function open_document(file) {
		if (file['error']) {
			alert(file['error']['message']);
			location.hash = '#';
			return;
		}
		var hash = '#edit/' + file['id'];
		if (location.hash !== hash) {
			file_by_id_fast = file;
			location.hash = hash.substring(1);
			return;
		}
		status('downloading', true);
		function document_ready(doc) {
			status('downloading', false);
			if (location.hash !== hash) {
				return;
			}

			var grid_size = 128;
			function mouse_to_paper(e) {
				return [(e.offsetX - viewport.width / 2) / grid_size, (e.offsetY - viewport.height / 2) / grid_size];
			}

			function paper_to_mouse(xy) {
				return [xy[0] * grid_size + viewport.width / 2, xy[1] * grid_size + viewport.height / 2];
			}

			var mouse_prev = null;
			var stroke_index = null;
			function mousedown(e) {
				if (e.button === 0) {
					var mouse = mouse_to_paper(e);
					console.log('mouse down', e, mouse);
					mouse_prev = mouse;
					var index = strokes.push([mouse]) - 1;
					stroke_index = strokes.registerReference(index, gapi.drive.realtime.IndexReference.DeleteMode.SHIFT_TO_INVALID);
					viewport.addEventListener('mousemove', mousemove, false);
				}
			}

			function mouseup(e) {
				if (e.button === 0) {
					console.log('mouse up', e);
					mouse_prev = null;
					stroke_index = null;
					viewport.removeEventListener('mousemove', mousemove);
				}
			}

			function mousemove(e) {
				var mouse = mouse_to_paper(e);
				if (mouse_prev[0] !== mouse[0] || mouse_prev[1] !== mouse[1]) {
					var stroke = strokes.get(stroke_index.index);
					strokes.set(stroke_index.index, stroke.concat([mouse]));
					console.log('mouse move', e, mouse_prev, mouse);
				}
				mouse_prev = mouse;
			}

			var model = doc.getModel();
			var root = model.getRoot();
			var version = root.get('v');
			var strokes = root.get('s');
			viewport.addEventListener('mousedown', mousedown, false);
			viewport.addEventListener('mouseup', mouseup, false);
			repaint_ = function(ctx) {
				viewport.style.backgroundImage = 'url(grid300.svg)';
				var backgroundPosition = paper_to_mouse([0, 0]);
				viewport.style.backgroundPosition = backgroundPosition[0] + 'px ' + backgroundPosition[1] + 'px';
				viewport.style.backgroundSize = grid_size + 'px';
				strokes.asArray().forEach(function(stroke) {
					ctx.lineWidth = 2;
					ctx.lineJoin = ctx.lineCap = 'round';
					var first = true;
					stroke.forEach(function(xy) {
						var coord = paper_to_mouse(xy);
						if (first) {
							ctx.beginPath();
							ctx.moveTo(coord[0], coord[1]);
							first = false;
						} else {
							ctx.lineTo(coord[0], coord[1]);
						}
					});
					ctx.stroke();
				})
			};
			close = function() {
				viewport.removeEventListener('mousedown', mousedown);
				viewport.removeEventListener('mouseup', mouseup);
				viewport.removeEventListener('mousemove', mousemove);
				doc.removeAllEventListeners();
				doc.close();
				repaint_ = function(ctx) {};
			};
			if (version !== CURRENT_VERSION) {
				console.log(version);
				alert('expected version ' + JSON.stringify(CURRENT_VERSION) + ' but got version ' + JSON.stringify(version));
				close();
				close = null;
				return;
			}
			repaint();

			doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_JOINED, function(e) {
				console.log('collaborator joined', e);
			}, false);
			doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_LEFT, function(e) {
				console.log('collaborator left', e);
			}, false);
			doc.addEventListener(gapi.drive.realtime.EventType.DOCUMENT_SAVE_STATE_CHANGED, function(e) {
				console.log('document save state changed', e);
				status('saving', e.isSaving);
			}, false);
			doc.addEventListener(gapi.drive.realtime.EventType.ATTRIBUTE_CHANGED, function(e) {
				console.log('attribute changed', e);
			}, false);

			model.addEventListener(gapi.drive.realtime.EventType.UNDO_REDO_STATE_CHANGED, function(e) {
				console.log('undo redo state changed', e, 'canundo:', model.canUndo, 'canredo:', model.canRedo);
			}, false);

			root.addEventListener(gapi.drive.realtime.EventType.OBJECT_CHANGED, function(e) {
				console.log('object changed', e);
				repaint();
			}, false);
		}
		realtime.load(file['id'], document_ready, init_realtime_document);
		document.getElementById('document-title').textContent = file.title;
		document.title = file.title + ' - Graph Paper';
	}

	function init_realtime_document(model) {
		var root = model.getRoot();
		root.set('v', CURRENT_VERSION);
		root.set('s', model.createList());
	}

	return function() {
		setTimeout(check_auth, 1);
	};
}();
