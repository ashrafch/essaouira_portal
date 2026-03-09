import { motion } from "framer-motion";
import { cn } from "./utils";
import "./ui.css";

const MotionDiv = motion.div;

function AppCard({ children, className = "", hover = false, style = {}, ...props }) {
  const classes = cn("ui-surface ui-card", hover && "ui-card-hover", className);
  if (hover) {
    return (
      <MotionDiv
        whileHover={{ y: -2 }}
        transition={{ duration: 0.15 }}
        className={classes}
        style={style}
        {...props}
      >
        {children}
      </MotionDiv>
    );
  }
  return (
    <div className={classes} style={style} {...props}>
      {children}
    </div>
  );
}

export default AppCard;
