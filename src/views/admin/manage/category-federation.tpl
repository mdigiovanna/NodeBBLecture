
<div class="px-lg-4">

	<div class="row border-bottom py-2 m-0 mb-3 sticky-top acp-page-main-header align-items-center">
		<div class="col-12 px-0 mb-1 mb-md-0 d-flex justify-content-between align-items-center">
			<h4 class="fw-bold tracking-tight mb-0">[[admin/manage/categories:federation.title, {name}]]</h4>
			<!-- IMPORT admin/partials/category/selector-dropdown-right.tpl -->
		</div>
	</div>

	{{{ if !enabled }}}
	<div class="alert alert-warning">
		<p>[[admin/manage/categories:federation.disabled]]</p>
		<a class="btn btn-primary" href="{config.relative_path}/admin/settings/activitypub">[[admin/manage/categories:federation.disabled-cta]]</a>
	</div>
	{{{ else }}}
	<div class="acp-page-container">
		<div class="row settings m-0">
			<div class="col-12 col-md-8 px-0 mb-4" tabindex="0">
				<div id="site-settings" class="mb-4">
					<form role="form">
						<h5 class="fw-bold settings-header">[[admin/manage/categories:federation.syncing-header]]</h5>
						<p>[[admin/manage/categories:federation.syncing-intro]]</p>
						<p class="form-text">[[admin/manage/categories:federation.syncing-caveat]]</p>

						{{{ if !following.length }}}
						<div class="alert alert-info">[[admin/manage/categories:federation.syncing-none]]</div>
						{{{ else }}}
						<table class="table">
							<thead>
								<tr>
									<th>[[admin/manage/categories:federation.syncing-actorUri]]</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{{{ each following }}}
								<tr>
									<td>
										<pre class="mb-0 mt-1">{./id}</pre>
										{{{ if !./approved }}}
										<span class="form-text text-warning">Pending</span>
										{{{ end }}}
									</td>
									<td>
										<button type="button" data-action="unfollow" data-actor="{./id}" class="btn btn-sm btn-danger">[[admin/manage/categories:federation.syncing-unfollow]]</button>
									</td>
								</tr>
								{{{ end }}}
							</tbody>
						</table>
						{{{ end }}}

						<div class="mb-3">
							<label class="form-label" for="syncing.add">[[admin/manage/categories:federation.syncing-add]]</label>
							<div class="input-group">
								<input id="syncing.add" type="url" class="form-control" />
								<button data-action="follow" type="button" class="btn btn-primary">[[admin/manage/categories:federation.syncing-follow]]</button>
							</div>
						</div>
					</form>
				</div>
			</div>
		</div>
	</div>
	{{{ end }}}
</div>