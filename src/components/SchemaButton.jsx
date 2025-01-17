import React from "react";

const SchemaButton = (props) => {
  const { className, id, onClick, value } = props;

  return (
    <li className={className}>
      {/* not sure what this is doing, hesistant to delete */}
      {/* {" "} */}
      <button className="schema-button" id={id} onClick={onClick}>
        {value}
      </button>
    </li>
  );
};

export default SchemaButton;
