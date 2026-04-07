"""
Base agent interface.
All agents inherit from BaseAgent and implement the `run` method.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any


class BaseAgent(ABC):
    """Abstract base class for all pipeline agents."""

    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"agents.{name}")

    @abstractmethod
    async def run(self, *args, **kwargs) -> Any:
        """Execute the agent's primary task."""
        ...

    def log_info(self, msg: str):
        self.logger.info(f"[{self.name}] {msg}")

    def log_error(self, msg: str):
        self.logger.error(f"[{self.name}] {msg}")

    def log_warning(self, msg: str):
        self.logger.warning(f"[{self.name}] {msg}")
