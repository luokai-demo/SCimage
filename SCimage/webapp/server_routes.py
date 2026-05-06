from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ApiRoute:
    method: str
    pattern: re.Pattern[str]
    handler_name: str


API_ROUTES = (
    ApiRoute("GET", re.compile(r"^/api/jobs$"), "_route_get_jobs"),
    ApiRoute("GET", re.compile(r"^/api/gallery/images$"), "_route_get_gallery_images"),
    ApiRoute("GET", re.compile(r"^/api/gallery/groups$"), "_route_get_gallery_groups"),
    ApiRoute("GET", re.compile(r"^/api/genealogy/graph$"), "_route_get_genealogy_graph"),
    ApiRoute("GET", re.compile(r"^/api/maintenance/database$"), "_route_get_maintenance_database"),
    ApiRoute("GET", re.compile(r"^/api/maintenance/database/check$"), "_route_get_maintenance_database_check"),
    ApiRoute("GET", re.compile(r"^/api/provider-profiles$"), "_route_get_provider_profiles"),
    ApiRoute("GET", re.compile(r"^/api/workspace-state$"), "_route_get_workspace_state"),
    ApiRoute("GET", re.compile(r"^/api/queue$"), "_route_get_queue"),
    ApiRoute("GET", re.compile(r"^/api/events$"), "_route_get_events"),
    ApiRoute("GET", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)$"), "_route_get_job_status"),
    ApiRoute("POST", re.compile(r"^/api/jobs$"), "_route_create_job"),
    ApiRoute("POST", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)/retry$"), "_route_retry_job"),
    ApiRoute("POST", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)/cancel$"), "_route_cancel_job"),
    ApiRoute("POST", re.compile(r"^/api/provider-profiles$"), "_route_create_provider_profile"),
    ApiRoute("POST", re.compile(r"^/api/provider-profiles/models$"), "_route_list_provider_models"),
    ApiRoute("POST", re.compile(r"^/api/provider-profiles/(?P<profile_id>[^/]+)/activate$"), "_route_activate_provider_profile"),
    ApiRoute("POST", re.compile(r"^/api/maintenance/generated/cleanup-empty-dirs$"), "_route_cleanup_empty_generated_dirs"),
    ApiRoute("POST", re.compile(r"^/api/maintenance/database$"), "_route_maintain_database"),
    ApiRoute("POST", re.compile(r"^/api/genealogy/nodes/positions$"), "_route_update_genealogy_node_positions"),
    ApiRoute("POST", re.compile(r"^/api/gallery/batch/delete$"), "_route_batch_delete_images"),
    ApiRoute("POST", re.compile(r"^/api/gallery/batch/download$"), "_route_batch_download_images"),
    ApiRoute("PUT", re.compile(r"^/api/workspace-state$"), "_route_replace_workspace_state"),
    ApiRoute("PUT", re.compile(r"^/api/provider-profiles/(?P<profile_id>[^/]+)$"), "_route_update_provider_profile"),
    ApiRoute("DELETE", re.compile(r"^/api/provider-profiles/(?P<profile_id>[^/]+)$"), "_route_delete_provider_profile"),
    ApiRoute("DELETE", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)/images/(?P<slot>\d+)$"), "_route_delete_job_image"),
    ApiRoute("DELETE", re.compile(r"^/api/jobs/(?P<job_id>[^/]+)$"), "_route_delete_job"),
)
