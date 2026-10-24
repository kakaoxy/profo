"""已发布迁移的 checksum 冻结基线（跨环境唯一真源）。

**为什么需要这个文件**（2026-10-24）：
本项目已连续 3 次因「修改已 applied 的迁移 / 只对单个环境 rebaseline」导致
启动被 ``_verify_checksums`` 阻断，表现为 ``deploy-local.sh`` 报
「backend 健康状态为 unhealthy」或本地 ``dev-start.sh`` 启动即退出。
根因是 checksum 只存在于**每个环境自己的数据库账本**里，没有任何
跨环境真源可以比对——于是「本地改了 + 本地 rebaseline 了」看起来完全正常，
直到部署到生产才暴雷（或反过来：生产正常、本地起不来）。

**本文件的作用**：把「已经发布到生产」的每个迁移的 checksum 固化进仓库。
此后：
- ``tests/test_migration_freeze.py`` 会在 CI/pytest 中比对源码与基线，
  任何人改动已发布迁移都会**立刻**失败（而不是等到部署）；
- ``manage verify`` 会把**当前环境账本**与本基线比对，一次性发现「某个环境账本漂移」
  （输出里出现「与环境无关的已发布基线不一致」即为漂移）。

**如何更新（必须走追加迁移，不要改历史）**：
1. 新增一个**追加**迁移（版本号从 ``NEXT_VERSION`` 起），不要修改旧函数；
2. 部署到生产并确认 applied；
3. 用下面的命令更新本文件，然后提交::

       python -m migrations.manage freeze <version> --reason "..." --confirm

   ``freeze`` 只接受一个位置参数（``version``）；``--reason`` 必填、``--confirm`` 显式确认，
   未加 ``--confirm`` 时只打印提示、不写文件。

生成方式：部署后从生产账本导出（``select version,checksum from schema_migrations
where status='applied' order by version``）。
"""

FROZEN_CHECKSUMS: dict[int, tuple[str, str]] = {
    1: ("add_token_version_column", "bff7d5fbc616c51846379b7e223d7b96dceb149d51c471caee955b488f63ff95"),
    2: ("add_phone_hash_column", "25b2288bb4458ea77826f2b56dd9dcde61a87dff9b898ab3fc79aa5266cd69aa"),
    3: ("encrypt_existing_phones", "3a3eae1f919c77c9313ffa311189831d68cc6cbef6b903f286cd41a3497ec77c"),
    4: ("populate_phone_hash", "55afad57464e512758b8e4f10a68d3493459f30ddfa4729f9348190539a8c81b"),
    5: ("add_user_temporary_fields", "2883e7c73693432eede911bd3b9f8a077dfe57d432a7b7d7b2873c142587550d"),
    6: ("add_stage_completed_dates_column", "506eacc2124669d1456b4144072283ba58488406684578a0606d220ad19177d7"),
    7: ("add_thumbnail_url_to_photos", "587d52cf8d37895e89d3c6e05cb107e42e02b4240d0c23e060e90cbad3957f1d"),
    8: ("add_renovation_extra_amount_columns", "4044d275c5eec3e49f81d0f3e1afc055d41b65eff406dc40ddc8ecc2172ca8c5"),
    9: ("drop_other_decoration_amount_column", "d36a155b96704f1ea497e46080b7570f3b593b0f313532af383e31f3229f0b19"),
    10: ("drop_soft_actual_cost_column", "b6fd1d71f0062529683658d5c52e7e5cbec714b00b4aa38291b76696fceaefa3"),
    11: ("add_contact_person_id_column", "a678849cfc1108206b50c963ffb69da53791b7b101258ed0eed3e748a8ce9a42"),
    12: ("run_fix_image_urls", "a3c80564bf65fe9f5c51fee6692e1b5dd935661f28729b5281a4097d0f2cd796"),
    13: ("create_investment_tables", "9d83ae7987a8f1417a6f986a35b65e751a201466d293763b793ec0768bf56fc2"),
    14: ("rename_return_adjustment_columns", "28c7e5789fed67678265ad914ee0a870ec78577e3efd45744c6a8d1eec09a197"),
    15: ("add_finance_record_counterparty_columns", "2a6e5274ac036c8e1bf199e7806fbefae3e493c85b68d01e52110a33379bf020"),
    16: ("create_finance_record_logs_table", "3786b15c8335e2799671241e5694309c50876bd0af195d40bde51067aef676a8"),
    17: ("create_finance_subjects_table", "721533f386b3a1d727b1118e17f63e21a2b999e69633804d06e450560995fda7"),
    18: ("migrate_finance_subjects_modes_to_jsonb", "a9d48d316d785bc57698c2e85fe98cbd4f29cb744f73be6a1040bf58b377e0ca"),
    19: ("add_finance_record_subject_columns", "ba2d84f787b631a9101d0d004459d4784dd3c542e5d331199045dda8f1a60faf"),
    20: ("add_finance_record_receipt_urls_column", "479b2e932e78b212c204493d23f8faf0b574230ab7e92e3ab88eaade64a8d1ef"),
    21: ("add_cashflow_category_enum_values", "ebe5b01c180074516138bd48aacdd9f1e4b4a267671c0bfdff019f2f2f618a96"),
    22: ("add_project_finance_settlement_columns", "f0409732c849095e870b749daedf303219ca0d9e011e6042daac071558b0bbd4"),
    23: ("add_project_archive_columns", "91c1355a773dbb7935aca2741f212ee7b9afb6da9a9f6d516062b43417b09008"),
    24: ("migrate_add_ended_status", "7578df73be18f9ff10b7f64d0764906c076d32a17d03a4b92b56808b6a73d228"),
    25: ("migrate_record_date_to_timestamptz", "a0c27d5a9cc1e6f4e9eff0c047b7ab680e12f82efe504c7b8098d214ed5e64a0"),
    26: ("migrate_project_date_columns_to_date", "c8129b68f4c06dae605229873720862ea6a38057a7a29e40910e0e8ee1c62872"),
    27: (
        "migrate_user_datetime_columns_to_timestamptz",
        "2f446c3692cd1ec6be667012d2a7ea9b526c10ff2829c46ef225a383629bf61a",
    ),
    28: ("migrate_encrypted_columns_to_text", "4e48ed59dd9ee5c1800d9991da57dfc57d94672c69a08aaf0547ec0ce7b61cb5"),
    29: ("widen_url_columns_to_text", "66ba8a12cfd348bf3260f905d4664490a91411ee74058fd19abce936d5f4f98e"),
    30: (
        "migrate_all_datetime_columns_to_timestamptz",
        "2bcc36f55de1ebc2c62896497e882f71c261b0ecdcb5f083bb9e0407b5bb17cf",
    ),
    31: ("migrate_uuid_columns_to_native_uuid", "be0d0c37edcc33dafd2c731205a14b4bf10c2d47ce4723adfac5cb41ec322e62"),
    32: ("create_wechat_oauth_tables", "7c5671d445801438f1fabd8081e41cebfab695df0870bbc0bee732b4b96abfa4"),
    33: ("create_user_roles_table", "1d4e9201c695954e90e4dcb42b8b4fa06126eb4472b5ccc56eb6e42fd056ccb0"),
    34: ("migrate_installation_stage_to_delivery", "bb84ca721642e61913a3d492fca8954924e2db99e0ad054bbc893e815ee60bcb"),
    35: ("add_media_type_to_renovation_photos", "700b392eefb94d9309886326c3b17447ba90004a3faf9d82810526cb3c6d78fa"),
    36: (
        "add_counterparty_type_to_finance_records",
        "089740314791960b3980a5b2d55b9431e57049091ef8a206854fad77998f5e18",
    ),
    37: ("cleanup_reserved_contracts", "6cfb16080c04e74205fbd472abc20bf885ddbca2f52d6f6023e07d3f6188ed21"),
    38: ("rebuild_contract_no_index", "c101adf3ce72538c4a0b65aa2970b5097d99f8d2eb34a866c3c65420674086fc"),
    39: ("migrate_permission_system", "2bc32410f360b1a61ac03d7e7af71649c80b65009640d1526f00d9bf3efd758d"),
    40: ("migrate_project_business_permission", "fdbf63db6aec8baba682bd0395dbdde1e71418415ee70d05439f202aabe2f059"),
    41: ("add_role_is_system_column", "0dd10cc2a0eef48acfbfb759df1fbb3b542c3f5c0529941b6b162d1bdc2d5303"),
    42: ("add_permission_risk_level_column", "271d3959a43d9308340de330fc29dfaa0d8e156ed885cfac3ffe01fa4d7472b4"),
    43: ("add_permission_foreign_indexes", "6cd4946e3d5e0fb6e3792ddd840761a01f6f7c3e2297776ceb380201179a4f04"),
    44: ("add_reports_indexes", "9fcd4e6c6d247daefdf0d79ea3244b69246519dcd1e1e1b22a7cdbd3885e1545"),
    45: (
        "add_lead_eval_history_and_expected_price",
        "4562c8bd39dd0dbf782655ed7956d14f1b3f7b6cbb0e4b48a66a0f0df24d1668",
    ),
    46: ("add_lead_status_lost_to_competitor", "367561d92f09f737c29671999958ea34e0b88deb55dc68039106045bbb1d8cfa"),
    47: ("add_lead_referrer_column", "f486f9d4ab31a01432198083b040b764a3a4a74d944016f04986e9482d8012a9"),
    48: ("add_project_document_category", "51d38bacab16bc0768b2741ae2d043b705409698181ad80393a5add51b2cf9d0"),
    49: ("backfill_lead_total_price_from_expected", "b0c35b72451e65946444b612f56e2f7f66831e00579c7813f32f49ff48f3d735"),
    50: ("backfill_lead_unit_price", "815b44d8965773474e00a85317171e64d8dafaa9af86c7e7b0baa8232faf659d"),
    51: ("create_community_images_table", "b475ee359b55ae1c52fde3ef95b9bf05eae6bccc18936c187ddd7a1156540aa3"),
    52: ("create_recruit_tables", "ee7046351628f20bf3d438c5a61f0e59e8a196d03626644f4690ce5687f3d59a"),
    53: ("add_poster_bg_url_to_campaigns", "5af18b5c95d47a58331cd615123d4b64befba88694b72dc2eb373028d7e453bd"),
    54: ("ensure_visit_referrer_index", "5957073dd149b2fb782bf7ff2f5b5c39c55fb85e51c9e2b3a1abff8286d62959"),
    55: ("ensure_campaign_status_created_index", "9e4484cf743ec301c784fb13f409125bd1029e9975caaee1c43d1b12a32a1cbf"),
    56: ("create_project_booking_and_share_tables", "ec5b963cef4c8c4614bb870980b17690576539508c4945436392bfe0ad4d8b44"),
    57: ("add_project_booking_status_column", "cf4d2499c6c909cdcceb6f13e085ef38b74b37d7a16cacee55b01b67fb77ccd8"),
    58: ("create_property_sheet_tables", "9ba372772975660546745cfb6f1013475415b9edb1b7eb9534f8d2f1e059d47a"),
    59: ("create_customer_follow_ups_table", "2f4ca8d8a8b8e5c5e811219aaa6fa3c7ad683269d2f886c0925175adf1d82bac"),
    60: ("create_system_configs_table", "75de0baf37188eca39bbcbf6700ec176989c5d3574ed6d00e06bc3e90568eca2"),
    61: ("create_key_tables", "2f363f48771ba8b553e8497d8938ce2745f5a184845186a4d867026695b704c4"),
    62: ("add_key_audit_share_id_index", "bbebcab3df75a28d88fb60179fbc1eddbd1cbb55e18b2d88496d2fb2e4333fae"),
    63: ("add_normal_key_seq_column", "3dea5f242e4661cecfef0f3e9b8881992a672785a97b83fcc658884245e03707"),
    64: ("add_project_key_note_column", "fbe3802512d623661c9ff2f435c5c21a3c2e6aeeee6383e2841b42ba08dec839"),
    65: ("add_trgm_search_indexes", "5da0e9c3fdbf33a6a2959bee5d9a5b44e7e2064f1e92fbfd6d27a25dbb190696"),
    66: ("add_lead_auditor_index", "36c90be00608092ca30a94cfd216768558157fd3059b1b0d8e0c81377fafd29d"),
    67: ("create_marketing_subscription_tables", "896e1972284dd177f7f888e973b29629a35fb62162cfeb6dbbfe54972345c898"),
    68: (
        "add_published_at_to_l4_marketing_projects",
        "b08d1e3c89ee3183ddd00bcbe2e7c5974f59039e9accbfc7bdcd4c47a5917ae3",
    ),
    69: ("add_price_change_id_to_notify_logs", "1ad47daaf7bd62fd53a9c4e9e506d48567a8bdb46353db6f2b35bc90859b85e6"),
    70: (
        "add_price_change_id_index_to_notify_logs",
        "8621367a18e3e821c3b2bfb5bbd68dd5c59095e4c52bec9994b682f9e6be518b",
    ),
    71: (
        "create_marketing_project_subscription_table",
        "5f3ab330e0841963e2b9d78fb8bd109c5c3bb9dd26f90894e51d530f92da230c",
    ),
    72: ("widen_subscription_openid_columns", "6694ac01e1842146ba3a69aed6217a42ace35c83a231223c9ac83a2012d158ed"),
    73: ("add_lead_referrer_index", "58d79574b44d7439adf2092baa9d4aedc81d90fad421aee240aa9bbd3be7f7ad"),
    74: ("clear_wechat_session_key", "906bdf31971362ae35ca18766a9cd7ab7ec9833e1d11359354e2689624589c10"),
    75: ("migrate_uploads_to_oss", "6a3b3a8443ac11c2fdeeeb93f7237e381fcbaf74a44d847f5d6d647bed210240"),
    76: ("run_building_dictionary_migrations", "604419d3089eb28d796d0d2e01f04c1753580d7599dfc093f5980dfa770a9d05"),
    77: ("widen_community_address_column", "c44820871090c7e91badc3a3f300f3306294fd3f8e1fceca0336f173ff77da8f"),
    78: ("backfill_bd_room_floor", "a876efdfc9e6b880ae77885a957c9ba7bd32a8ea76d9f1d83461595f42978ddb"),
    79: ("recover_stale_bd_import_tasks", "ccf3391563ada5d92b311a03b09fb9605126f3779daefec1104d97969eb9ee10"),
    80: ("run_bd_audit_20261017_fixes", "ddb7f7639fd508f7e1722516b45aa945b6b4d372b4af978dc5458a0dabb404df"),
    81: ("run_bd_audit_20261018_fixes", "1304c4ae574c828193da9265af20eff59924d65c80f67345e3d4837a3b721152"),
    82: ("create_biz_dict_items_table", "82d4a7cc2b58d0e4614d6265a60740096c60e3a5c13cbeeb286fc01d00242b9f"),
    83: ("add_lead_eval_verdict_fields", "1a30118eccc824ed7f74f73cd4ac4f3d0911805270ce7927dea7463ac9c4c1e9"),
    84: ("create_fund_account_tables", "59ed4708feab104b4755f4b435d8ebd1af304e25a95b08a8050e56d0bd7c33d4"),
    85: ("add_finance_record_account_column", "7dca25be03923144e891830946f67bddcade110cc095f1e228967dbb462bae0a"),
    86: ("close_orphan_finance_records", "052991244a3a55cf194f049b9251c5ead83e867b2a0c05f6addcacfae781d0b3"),
    87: ("backfill_finance_record_operator", "836f991913a0310f35995e323c6203e12c5753f1199d9ee8123f7b6212cc4a27"),
    88: (
        "migrate_project_document_archive_date_to_date",
        "1bbe31296e8868fbb8df218cb5d8ea10c61b87cbd00b09775096b8df2272f81e",
    ),
    89: ("rebuild_project_sale_unique_index", "2b48fefbac27aa86c86788927d2d97943fa2685a766f4eaca2c356586bafec72"),
    90: ("batched_backfill_leads_and_finance", "28e83e9dbebd4034715cfa5365f0d4c6018ada0ba8134ccf85ec1c9cdd6a517c"),
    91: ("rename_investment_subjects", "2db3de28274afa4f7525f878d3a6c9d2436c7b0d661e6ec90868f561558c191a"),
    92: ("cleanup_redundant_soft_deleted_sales", "7eda8ad253067c14a376c06a0e0bbffe5c46cf16a66b5b1df03a71a6ccf5dd5a"),
    93: ("backfill_lead_and_operator_reachability", "3dd6f52ef0cf99c3647c809611145f56f0960455723139f0699ff82dbf4272d6"),
    94: ("backfill_leads_and_operator_hardened", "df9c129bb2e4f3d4029fc2a90d11ea846e5e5ed7ffc72ef3b21b3abca010b966"),
}

# 冻结基线对应的生产版本上限（新增迁移不受此约束，但历史项必须逐字一致）
FROZEN_MAX_VERSION = 94
