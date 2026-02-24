from enum import Enum


class StaffRole(str, Enum):
    housekeeping = "housekeeping"
    kitchen = "kitchen"
    reception_day = "reception_day"
    reception_night = "reception_night"
    manager = "manager"
