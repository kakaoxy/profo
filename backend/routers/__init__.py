"""API 路由模块.

按业务领域划分：market / leads / projects / finance / marketing / system / common / monitor.
各子模块 router 由 main.py 直接从子模块导入，本包不集中 re-export，
避免新增模块时遗漏维护导出列表。
"""
