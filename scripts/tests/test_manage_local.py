import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("manage_local", Path(__file__).resolve().parents[1] / "manage-local.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ManagementTests(unittest.TestCase):
    def test_config_created_once_and_secrets_not_rotated(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "config.json"
            first = module.load_config(path, create=True)
            self.assertEqual(first, module.load_config(path, create=True))
            self.assertEqual(len(set(first[key] for key in module.SECRET_KEYS)), 3)
            for key in module.SECRET_KEYS:
                self.assertGreaterEqual(len(first[key]), 32)

    def test_refuses_foreign_config_and_qa_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "config.json"
            config = module.load_config(path, create=True)
            for change in ({"ADMIN_USERNAME": "verifier"}, {"WEB_PORT": "0"}, {"POSTGRES_PASSWORD": "weak"}, {"COMPOSE_PROJECT_NAME": "portal-verify-test"}):
                path.write_text(json.dumps({**config, **change}), encoding="utf-8")
                with self.assertRaises(ValueError):
                    module.load_config(path, create=False)

    def test_shell_cannot_select_qa_or_home_assistant(self):
        with patch.dict(os.environ, {"COMPOSE_PROJECT_NAME": "portal-verify-test", "COMPOSE_FILE": "other.yml", "HOME_ASSISTANT_TOKEN": "foreign", "SMART_PROVIDER_MODE": "villacore"}):
            env = module.compose_environment({"WEB_PORT": "8081"})
            self.assertNotIn("COMPOSE_PROJECT_NAME", env)
            self.assertNotIn("COMPOSE_FILE", env)
            self.assertEqual(env["SMART_PROVIDER_MODE"], "mock")
            self.assertEqual(env["HOME_ASSISTANT_TOKEN"], "")
            self.assertEqual(env["POSTGRES_DB"], "management")

    def fake_api(self, units):
        prop = {"id": 1, "code": "default-property" if not units else module.PROPERTY_CODE}
        writes = []

        def api(path, body=None, *, method=None):
            if body is not None:
                writes.append((path, body, method))
            if path == "/units":
                return list(units)
            if path == "/properties":
                return [prop]
            if path == "/properties/1":
                prop.update(body)
            if path == "/setup/units":
                next_id = len(units) + 1
                units.extend({"id": next_id + i, "name": name, "property_id": 1} for i, name in enumerate(body["units"]))
            return {}
        return api, writes

    def test_initialization_is_idempotent_and_adds_no_business_fixtures(self):
        units = []
        api, writes = self.fake_api(units)
        module.initialize_inventory(api)
        self.assertEqual(len(units), 6)
        self.assertEqual([row[0] for row in writes], ["/properties/1", "/setup/start", "/setup/units"])
        writes.clear()
        module.initialize_inventory(api)
        self.assertEqual(writes, [])
        self.assertEqual(len(units), 6)

    def test_refuses_qa_inventory_without_writes(self):
        api, writes = self.fake_api([{"id": 1, "name": "QA desktop", "property_id": 1}])
        with self.assertRaises(ValueError):
            module.initialize_inventory(api)
        self.assertEqual(writes, [])

    def test_partial_initialization_adds_only_missing_units(self):
        units = [{"id": 1, "name": module.UNIT_NAMES[0], "property_id": 1}]
        api, writes = self.fake_api(units)
        module.initialize_inventory(api)
        self.assertEqual(len(units), 6)
        self.assertEqual(writes[-1][1]["units"], list(module.UNIT_NAMES[1:]))


if __name__ == "__main__":
    unittest.main()
