(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-41367436-1', 'auto');
ga('send', 'pageview', {'page': '/graph-paper/'});

var gapi_client_load = function() {
	"use strict";

	var CLIENT_ID = '477142404112-nupku65oo2pis2ajtdqobp53ek38dofc.apps.googleusercontent.com';
	var SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.install'];
	var MIME_TYPE = 'application/prs.benlubar-graphpaper+json';
	var DEFAULT_TITLE = 'Untitled Graph Paper';

	var view_changed = 0;

	function check_auth() {
		gapi.auth.authorize({'client_id': CLIENT_ID, 'scope': SCOPES, 'immediate': true}, handle_auth);
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
				gapi.auth.authorize({'client_id': CLIENT_ID, 'scope': SCOPES, 'immediate': false}, handle_auth);
			};
		}
	}

	function ready() {
		status('connecting', false);

		document.getElementById('new').onclick = function() {
			new_document(open_document);
		};

		window.onhashchange = hash_changed;
		hash_changed();
		window.onresize = window_resized;
		window_resized();
	}

	var repaint = function() {};

	function window_resized() {
		var viewport = document.getElementById('viewport');
		viewport.width = window.innerWidth;
		viewport.height = window.innerHeight - 8 - 32 - 8;
		repaint();
	}

	function hash_changed() {
		view_changed++;

		ga('send', 'pageview', {'page': '/graph-paper/' + location.hash.replace(/^#/, '')});

		document.getElementById('main').style.display = 'none';
		document.getElementById('viewport-container').style.display = 'none';

		var view_id = view_changed;
		var matches;
		if (matches = /^#edit\/(.*)$/.exec(location.hash)) {
			document.getElementById('viewport-container').style.display = 'block';
			status('retrieving-file-metadata', true);
			get_file_by_id(matches[1], function(file) {
				status('retrieving-file-metadata', false);
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
		console.log(el, file);
	}

	function new_document(callback) {
		const boundary = '-------314159265358979323846';
		const delimiter = "\r\n--" + boundary + "\r\n";
		const close_delim = "\r\n--" + boundary + "--";

		var metadata = {
			'title': DEFAULT_TITLE,
			'mimeType': MIME_TYPE
		};

		var multipartRequestBody = delimiter +
			'Content-Type: application/json\r\n\r\n' +
			JSON.stringify(metadata) +
			delimiter +
			'Content-Type: ' + MIME_TYPE + '\r\n' +
			'Content-Transfer-Encoding: base64\r\n' +
			'\r\n' +
			btoa('{}') +
			close_delim;

		var request = gapi.client.request({
			'path': '/upload/drive/v2/files',
			'method': 'POST',
			'params': {'uploadType': 'multipart'},
			'headers': {
				'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
			},
			'body': multipartRequestBody
		});
		if (!callback) {
			callback = function(file) {
				console.log(file);
			};
		}
		request.execute(callback);
	}

	function open_document(file) {
		var hash = '#edit/' + file['id'];
		if (location.hash !== hash) {
			location.hash = hash.substring(1);
			return;
		}
		download_document(file, function(data) {
			if (location.hash !== hash) {
				return;
			}
			console.log(file, data);
		});
		document.getElementById('document-title').textContent = file.title;
	}

	function download_document(file, callback) {
		if (file['downloadUrl']) {
			status('downloading-file-data', true);
			var xhr = new XMLHttpRequest();
			xhr.open('GET', file['downloadUrl']);
			xhr.setRequestHeader('Authorization', 'Bearer ' + gapi.auth.getToken().access_token);
			xhr.onload = function() {
				status('downloading-file-data', false);
				callback(JSON.parse(xhr.responseText));
			};
			xhr.onerror = function() {
				status('downloading-file-data', false);
				callback(null);
			};
			xhr.send();
		} else {
			callback(null);
		}
	}

	return function() {
		setTimeout(check_auth, 1);
	};
}();
