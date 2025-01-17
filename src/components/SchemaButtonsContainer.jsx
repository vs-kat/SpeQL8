import React from "react";
import SchemaButton from "./SchemaButton";

const SchemaButtonsContainer = (props) => {
  const { schemaList } = props;
  const { handleQuery } = props;

  const schemaButtonList = schemaList.map((item, index) => {
    return (
      <SchemaButton
        className="schema-list-element"
        key={`${index}`}
        id={`schema-button-${index}`}
        onClick={handleQuery}
        value={item}
      />
    );
  });

  return <ul className="schema-button-list">{schemaButtonList}</ul>;
};

export default SchemaButtonsContainer;
